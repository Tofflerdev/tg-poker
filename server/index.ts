import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server, type DefaultEventsMap } from "socket.io";
import { assertSafeBootOrExit, validateInitData, createUserFromInitData } from "./middleware/auth.js";
import { userStorage } from "./models/User.js";
import { tableManager } from "./TableManager.js";
import { UserRepository } from "./db/UserRepository.js";
import type {
  TelegramUser,
  AuthPayload,
  ExtendedClientEvents,
  ExtendedServerEvents,
  SocketData,
} from "../types/index.js";

// Boot guard — exits with code 1 if the env is unsafe for production
assertSafeBootOrExit();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// CORS: allow all in dev, restrict in production
const CORS_ORIGIN = process.env.NODE_ENV === 'production'
  ? ["https://tgp.isgood.host"]
  : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];

const io = new Server<ExtendedClientEvents, ExtendedServerEvents, DefaultEventsMap, SocketData>(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true
  },
});

const PORT = parseInt(process.env.PORT || "3000", 10);

// Debug endpoint
app.get("/", (_req, res) => {
  const status = {
    status: "running",
    tables: tableManager.tableCount,
    activePlayers: tableManager.totalActivePlayers,
    tableSummary: tableManager.getStatusSummary(),
  };
  res.json(status);
});

// Get tables list endpoint (REST API fallback)
app.get("/api/tables", (_req, res) => {
  res.json(tableManager.getAllTablesInfo());
});

/**
 * Resolve the live socketId for a telegramId.
 * Returns undefined if the player has no active socket.
 */
const getSocketId = (telegramId: string): string | undefined => {
  return tableManager.getSocketIdForTelegram(telegramId);
};

/**
 * Send game state to all players at a specific table.
 * Each player receives a personalised view (their own cards revealed).
 */
const updateTableState = (tableId: string) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;

  const playerIds = table.getAllPlayerIds(); // telegramIds

  playerIds.forEach((telegramId) => {
    const playerState = table.getStateForPlayer(telegramId);
    const socketId = getSocketId(telegramId);
    if (socketId) {
      io.to(socketId).emit("state", playerState);
    }
  });
};

/**
 * Handle showdown at a table
 */
const handleTableShowdown = (tableId: string, result: any) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;

  // Emit showdown to all players at the table
  const playerIds = table.getAllPlayerIds(); // telegramIds
  playerIds.forEach((telegramId) => {
    const socketId = getSocketId(telegramId);
    if (socketId) {
      io.to(socketId).emit("showdown", result);
    }
  });

  // Check for players with zero chips
  const state = table.getState();
  state.seats.forEach((player) => {
    if (player && player.chips === 0) {
      const telegramId = player.id; // player.id === telegramId
      table.removePlayer(telegramId);
      table.addSpectator(telegramId);
      const socketId = getSocketId(telegramId);
      if (socketId) {
        io.to(socketId).emit("errorMessage", "Ваш стек равен 0. Вы покидаете стол.");
      }
    }
  });

  updateTableState(tableId);

  // Schedule next hand automatically
  setTimeout(() => {
    table.scheduleNextHand();
    // Broadcast state update to show countdown
    updateTableState(tableId);
  }, 100);
};

// Setup table event handlers
const setupTableEvents = (tableId: string) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;

  table.setOnShowdown((result) => {
    handleTableShowdown(tableId, result);
  });

  table.setOnStateChange(() => {
    updateTableState(tableId);
  });

  table.setOnPlayerAction((_evt) => {
    // Phase 1: no-op. Phase 3 broadcasts actionBubble. Phase 3 writes HandHistory.
    // Keep block empty to preserve Phase 1 success criterion "no behavior change".
  });

  table.setOnHandComplete((_evt) => {
    // Phase 1: no-op. Phase 3 queues HandHistory writes; Phase 3 checkpoints chips.
  });
};

// Initialize table events for all predefined tables
setTimeout(() => {
  const tables = tableManager.getAllTablesInfo();
  tables.forEach((t) => setupTableEvents(t.id));
}, 1000);

io.on("connection", (socket) => {
  console.log("[Socket] Player connected:", socket.id);

  // ==========================================
  // Authentication
  // ==========================================
  socket.on("auth", async (payload: AuthPayload) => {
    const validatedData = validateInitData(payload.initData);

    if (!validatedData) {
      console.warn("[Auth] Invalid initData from socket:", socket.id,
        "| initData length:", payload.initData?.length || 0,
        "| NODE_ENV:", process.env.NODE_ENV);
      socket.emit("authError", "Invalid authentication data");
      return;
    }

    try {
      // Create user from validated initData
      const user = await createUserFromInitData(validatedData, payload.devId);

      // Populate socket.data.telegramId BEFORE any downstream storage calls (T-01-04-01)
      socket.data.telegramId = String(user.telegramId);
      const telegramId = socket.data.telegramId;

      // Store user in session cache — keyed by telegramId
      userStorage.addUser(telegramId, user);

      // Wire eviction: if a prior socket is mapped for this telegramId, disconnect it (D-07 scaffold)
      tableManager.setSocketForTelegram(
        telegramId,
        socket.id,
        (priorSocketId) => {
          const prior = io.sockets.sockets.get(priorSocketId);
          if (prior) {
            // Phase 1 scaffold only — Phase 4 will emit replacedBySession + snapshot.
            // For now: disconnect the prior socket cleanly so no split-brain state.
            prior.emit('sessionReplaced' as any); // placeholder event; Phase 4 expands payload
            prior.disconnect(true);
          }
        }
      );

      // If the player is already seated at a table, refresh the transport handle
      const seatedTable = tableManager.getPlayerTable(telegramId);
      if (seatedTable) {
        seatedTable.updatePlayerSocketId(telegramId, socket.id);
      }

      socket.emit("authSuccess", user);
      console.log("[Auth] Success for:", user.username || user.displayName || user.telegramId,
        payload.devId ? `(dev mode, devId=${payload.devId})` : '');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Error for socket:", socket.id, "| Error:", errorMsg);

      if (process.env.NODE_ENV === 'development') {
        socket.emit("authError", `Authentication failed: ${errorMsg}`);
      } else {
        socket.emit("authError", "Authentication failed");
      }
    }
  });

  // ==========================================
  // Profile & Daily Bonus
  // ==========================================

  socket.on("claimDailyBonus", async () => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }
    const user = userStorage.getUser(telegramId);
    if (!user) return;

    try {
      const result = await UserRepository.claimDailyBonus(user.telegramId);

      if (result.success) {
        // Update local session
        user.balance = result.balance;
        user.lastDailyRefill = new Date().toISOString();
        user.canClaimDaily = false;

        socket.emit("dailyBonusClaimed", {
          balance: result.balance,
          nextClaimAt: result.nextClaimAt!.toISOString()
        });
        socket.emit("balanceUpdate", result.balance);
      } else {
        socket.emit("dailyBonusError", result.message || "Failed to claim bonus");
      }
    } catch (error) {
      console.error("[DailyBonus] Error:", error);
      socket.emit("dailyBonusError", "Server error");
    }
  });

  socket.on("getProfile", async () => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }
    const user = userStorage.getUser(telegramId);
    if (!user) return;

    try {
      const profile = await UserRepository.getProfile(user.telegramId);
      if (profile) {
        socket.emit("profileData", profile);
      } else {
        socket.emit("profileError", "Profile not found");
      }
    } catch (error) {
      console.error("[Profile] Error:", error);
      socket.emit("profileError", "Server error");
    }
  });

  socket.on("updateProfile", async (data) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }
    const user = userStorage.getUser(telegramId);
    if (!user) return;

    try {
      // Validate name
      if (data.displayName && (data.displayName.length < 2 || data.displayName.length > 20)) {
        socket.emit("profileError", "Name must be between 2 and 20 characters");
        return;
      }

      const updatedProfile = await UserRepository.updateProfile(
        user.telegramId,
        data.displayName,
        data.avatarUrl
      );

      // Update local session
      if (data.displayName) user.displayName = data.displayName;
      if (data.avatarUrl) user.avatarUrl = data.avatarUrl;

      socket.emit("profileUpdated", updatedProfile);
    } catch (error) {
      console.error("[Profile] Update Error:", error);
      socket.emit("profileError", "Failed to update profile");
    }
  });

  // ==========================================
  // Table Management
  // ==========================================

  // Get list of available tables
  socket.on("getTables", () => {
    const tables = tableManager.getAllTablesInfo();
    socket.emit("tablesList", tables);
    console.log(`[Tables] Sent ${tables.length} tables to socket ${socket.id}`);
  });

  // Join a specific table and seat
  socket.on("joinTable", async (payload: { tableId: string; seat: number }) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }

    const { tableId, seat } = payload;
    const user = userStorage.getUser(telegramId);

    if (!user) {
      socket.emit("errorMessage", "Authentication required");
      return;
    }

    // Check balance against buy-in
    const tableInfo = tableManager.getTable(tableId);
    if (tableInfo && user.balance < tableInfo.config.buyIn) {
      socket.emit("tableError", `Insufficient balance. Buy-in is ${tableInfo.config.buyIn}`);
      return;
    }

    // Leave current table if at one
    const currentTableId = tableManager.getPlayerTableId(telegramId);
    if (currentTableId) {
      socket.leave(currentTableId);
      tableManager.leaveTable(telegramId);
    }

    // Join new table
    const result = tableManager.joinTable(telegramId, tableId, seat);

    if (!result.success) {
      socket.emit("tableError", result.error || "Failed to join table");
      return;
    }

    // Deduct buy-in from DB
    try {
      const newBalance = await UserRepository.updateBalance(user.telegramId, -tableInfo!.config.buyIn);
      user.balance = newBalance;
      socket.emit("balanceUpdate", newBalance);
    } catch (error) {
      console.error("Failed to deduct buy-in:", error);
      // Rollback join? For now just log error, but ideally we should remove player
    }

    // Join socket room for this table
    socket.join(tableId);

    const table = tableManager.getTable(tableId);
    if (table) {
      const state = table.getStateForPlayer(telegramId);
      socket.emit("tableJoined", { tableId, seat: result.seat!, state });
      updateTableState(tableId);
      console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) joined ${tableId} at seat ${result.seat}`);
    }
  });

  // Leave current table
  socket.on("leaveTable", async () => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }

    const tableId = tableManager.getPlayerTableId(telegramId);
    if (tableId) {
      // Get chips before leaving
      const table = tableManager.getTable(tableId);
      const player = table?.getPlayer(telegramId);
      const chipsToReturn = player ? player.chips : 0;

      socket.leave(tableId);
      tableManager.leaveTable(telegramId);
      socket.emit("tableLeft");
      updateTableState(tableId);
      console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) left ${tableId}`);

      // Return chips to DB
      const user = userStorage.getUser(telegramId);
      if (user && chipsToReturn > 0) {
        try {
          const newBalance = await UserRepository.updateBalance(user.telegramId, chipsToReturn);
          user.balance = newBalance;
          socket.emit("balanceUpdate", newBalance);
        } catch (error) {
          console.error("Failed to return chips:", error);
        }
      }
    }
  });

  // ==========================================
  // Game Actions (forward to appropriate table)
  // ==========================================

  const handleGameAction = (action: string, ...args: any[]) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return false;
    }

    const table = tableManager.getPlayerTable(telegramId);
    if (!table) {
      socket.emit("errorMessage", "You are not at a table");
      return false;
    }

    const tableId = table.id;

    switch (action) {
      case 'fold':
        if (table.fold(telegramId)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot fold now");
        }
        break;

      case 'check':
        if (table.check(telegramId)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot check now");
        }
        break;

      case 'call':
        if (table.call(telegramId)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot call now");
        }
        break;

      case 'raise':
        const amount = args[0];
        if (table.raise(telegramId, amount)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot raise now");
        }
        break;

      case 'allIn':
        if (table.allIn(telegramId)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot go all-in now");
        }
        break;

      case 'showCards':
        if (table.showCards(telegramId)) {
          updateTableState(tableId);
        }
        break;

      case 'showdown':
        const result = table.showdown();
        handleTableShowdown(tableId, result);
        break;

      case 'getState':
        const state = table.getStateForPlayer(telegramId);
        socket.emit("state", state);
        break;

      case 'sitOut':
        if (table.sitOut(telegramId)) {
          updateTableState(tableId);
        }
        break;

      case 'sitIn':
        if (table.sitIn(telegramId)) {
          updateTableState(tableId);
        }
        break;
    }

    return true;
  };

  const checkShowdownAndUpdate = (table: any, tableId: string) => {
    const state = table.getState();
    if (state.stage === 'showdown' && table.game?.lastShowdown) {
      handleTableShowdown(tableId, table.game.lastShowdown);
    } else {
      updateTableState(tableId);
    }
  };

  // Game action handlers
  socket.on("getState", () => handleGameAction('getState'));
  socket.on("fold", () => handleGameAction('fold'));
  socket.on("check", () => handleGameAction('check'));
  socket.on("call", () => handleGameAction('call'));
  socket.on("raise", (amount: number) => handleGameAction('raise', amount));
  socket.on("allIn", () => handleGameAction('allIn'));
  socket.on("showCards", () => handleGameAction('showCards'));
  socket.on("showdown", () => handleGameAction('showdown'));
  socket.on("sitOut", () => handleGameAction('sitOut'));
  socket.on("sitIn", () => handleGameAction('sitIn'));

  // Legacy "join" handler - auto-assigns to first available table
  socket.on("join", async (seat: number) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("errorMessage", "Auth required");
      return;
    }

    // Find first available table
    const tables = tableManager.getAllTablesInfo();
    const availableTable = tables.find(t => t.status !== 'full');

    if (!availableTable) {
      socket.emit("errorMessage", "No available tables");
      return;
    }

    // Use joinTable logic
    const currentTableId = tableManager.getPlayerTableId(telegramId);
    if (currentTableId) {
      socket.leave(currentTableId);
      tableManager.leaveTable(telegramId);
    }

    // Check balance
    const user = userStorage.getUser(telegramId);
    if (!user) {
      socket.emit("errorMessage", "Auth required");
      return;
    }
    if (user.balance < availableTable.config.buyIn) {
      socket.emit("errorMessage", "Insufficient balance");
      return;
    }

    const result = tableManager.joinTable(telegramId, availableTable.id, seat);

    if (!result.success) {
      socket.emit("errorMessage", result.error || "Failed to join table");
      return;
    }

    // Deduct buy-in
    try {
      const newBalance = await UserRepository.updateBalance(user.telegramId, -availableTable.config.buyIn);
      user.balance = newBalance;
      socket.emit("balanceUpdate", newBalance);
    } catch (error) {
      console.error("Failed to deduct buy-in", error);
    }

    socket.join(availableTable.id);

    const table = tableManager.getTable(availableTable.id);
    if (table) {
      const state = table.getStateForPlayer(telegramId);
      socket.emit("tableJoined", { tableId: availableTable.id, seat: result.seat!, state });
      updateTableState(availableTable.id);
      console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) auto-joined ${availableTable.id} at seat ${result.seat}`);
    }
  });

  // ==========================================
  // Chat
  // ==========================================
  socket.on("sendChatMessage", (messageData) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }

    const tableId = tableManager.getPlayerTableId(telegramId);
    if (!tableId) {
      socket.emit("errorMessage", "You are not at a table");
      return;
    }

    const table = tableManager.getTable(tableId);
    if (!table) return;

    // Create full message with ID and timestamp
    const fullMessage = {
      ...messageData,
      id: `${telegramId}-${Date.now()}`, // use telegramId in message ID for traceability
      timestamp: Date.now(),
    };

    // Broadcast to all players at the table (telegramIds → resolve socketIds)
    const playerIds = table.getAllPlayerIds(); // telegramIds
    playerIds.forEach((pid) => {
      const sid = getSocketId(pid);
      if (sid) {
        io.to(sid).emit("chatMessage", fullMessage);
      }
    });

    console.log(`[Chat] ${tableId}: ${messageData.authorName}: ${messageData.text.substring(0, 50)}`);
  });

  // ==========================================
  // Disconnect
  // ==========================================
  socket.on("disconnect", async () => {
    console.log("[Socket] Player disconnected:", socket.id);

    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      // Socket never authenticated — nothing to clean up
      return;
    }

    // Clear transport handle on the seated player (Phase 4 adds grace window / sit-out)
    const seatedTable = tableManager.getPlayerTable(telegramId);
    if (seatedTable) {
      seatedTable.updatePlayerSocketId(telegramId, undefined);
    }

    const tableId = tableManager.getPlayerTableId(telegramId);
    if (tableId) {
      // Get chips before leaving
      const table = tableManager.getTable(tableId);
      const player = table?.getPlayer(telegramId);
      const chipsToReturn = player ? player.chips : 0;

      updateTableState(tableId);
      tableManager.handleDisconnect(telegramId);

      // Return chips to DB
      const user = userStorage.getUser(telegramId);
      if (user && chipsToReturn > 0) {
        try {
          await UserRepository.updateBalance(user.telegramId, chipsToReturn);
        } catch (error) {
          console.error("Failed to return chips on disconnect:", error);
        }
      }
    }

    // Only clear socketByTelegram if this socket is still the current mapping
    // (guards against out-of-order events during eviction — T-01-04-04)
    if (tableManager.getSocketIdForTelegram(telegramId) === socket.id) {
      tableManager.clearSocketForTelegram(telegramId);
    }

    userStorage.removeUser(telegramId);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Poker server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎲 Tables will be initialized shortly...`);
});
