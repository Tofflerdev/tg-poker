import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { validateInitData, createUserFromInitData } from "./middleware/auth.js";
import { userStorage } from "./models/User.js";
import { tableManager } from "./TableManager.js";
import { UserRepository } from "./db/UserRepository.js";
import type {
  TelegramUser,
  AuthPayload,
  ServerEvents,
  ExtendedClientEvents,
  ExtendedServerEvents
} from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// CORS: allow all in dev, restrict in production
const CORS_ORIGIN = process.env.NODE_ENV === 'production'
  ? ["https://tgp.isgood.host"]
  : ["*"];

const io = new Server<ExtendedClientEvents, ExtendedServerEvents>(server, {
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
 * Send game state to all players at a specific table
 */
const updateTableState = (tableId: string) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;

  const playerIds = table.getAllPlayerIds();
  
  playerIds.forEach((socketId) => {
    const playerState = table.getStateForPlayer(socketId);
    io.to(socketId).emit("state", playerState);
  });
};

/**
 * Handle showdown at a table
 */
const handleTableShowdown = (tableId: string, result: any) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;

  // Emit showdown to all players at the table
  const playerIds = table.getAllPlayerIds();
  playerIds.forEach((socketId) => {
    io.to(socketId).emit("showdown", result);
  });

  // Check for players with zero chips
  const state = table.getState();
  state.seats.forEach((player) => {
    if (player && player.chips === 0) {
      table.removePlayer(player.id);
      table.addSpectator(player.id);
      io.to(player.id).emit("errorMessage", "Ваш стек равен 0. Вы покидаете стол.");
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
    const { valid, data } = validateInitData(payload.initData);
    
    if (!valid) {
      socket.emit("authError", "Invalid authentication data");
      return;
    }

    try {
      // Create user from initData (handles dev mode mock user automatically)
      const user = await createUserFromInitData(socket.id, data || { auth_date: 0, hash: '' });
      
      // Store user in persistent storage (session cache)
      userStorage.addUser(socket.id, user);
      
      socket.emit("authSuccess", user);
      console.log("[Auth] Success for:", user.username || user.telegramId);
    } catch (error) {
      console.error("[Auth] Error:", error);
      socket.emit("authError", "Authentication failed");
    }
  });

  // ==========================================
  // Profile & Daily Bonus
  // ==========================================

  socket.on("claimDailyBonus", async () => {
    const user = userStorage.getUser(socket.id);
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
    const user = userStorage.getUser(socket.id);
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
    const user = userStorage.getUser(socket.id);
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
      
      // If user is at a table, we might want to update the table state to show new name
      // But that's complex, let's leave it for now or just update on next action
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
    console.log(`[Tables] Sent ${tables.length} tables to ${socket.id}`);
  });

  // Join a specific table and seat
  socket.on("joinTable", async (payload: { tableId: string; seat: number }) => {
    const { tableId, seat } = payload;
    const user = userStorage.getUser(socket.id);
    
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
    const currentTableId = tableManager.getPlayerTableId(socket.id);
    if (currentTableId) {
      socket.leave(currentTableId);
      tableManager.leaveTable(socket.id);
    }

    // Join new table
    const result = tableManager.joinTable(socket.id, tableId, seat);
    
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
      const state = table.getStateForPlayer(socket.id);
      socket.emit("tableJoined", { tableId, seat, state });
      updateTableState(tableId);
      console.log(`[Table] ${socket.id} joined ${tableId} at seat ${seat}`);
    }
  });

  // Leave current table
  socket.on("leaveTable", async () => {
    const tableId = tableManager.getPlayerTableId(socket.id);
    if (tableId) {
      // Get chips before leaving
      const table = tableManager.getTable(tableId);
      const player = table?.getPlayer(socket.id);
      const chipsToReturn = player ? player.chips : 0;

      socket.leave(tableId);
      tableManager.leaveTable(socket.id);
      socket.emit("tableLeft");
      updateTableState(tableId);
      console.log(`[Table] ${socket.id} left ${tableId}`);

      // Return chips to DB
      const user = userStorage.getUser(socket.id);
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
    const table = tableManager.getPlayerTable(socket.id);
    if (!table) {
      socket.emit("errorMessage", "You are not at a table");
      return false;
    }

    const tableId = table.id;
    
    switch (action) {
      case 'fold':
        if (table.fold(socket.id)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot fold now");
        }
        break;
      
      case 'check':
        if (table.check(socket.id)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot check now");
        }
        break;
      
      case 'call':
        if (table.call(socket.id)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot call now");
        }
        break;
      
      case 'raise':
        const amount = args[0];
        if (table.raise(socket.id, amount)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot raise now");
        }
        break;
      
      case 'allIn':
        if (table.allIn(socket.id)) {
          checkShowdownAndUpdate(table, tableId);
        } else {
          socket.emit("errorMessage", "Cannot go all-in now");
        }
        break;
      
      case 'showCards':
        if (table.showCards(socket.id)) {
          updateTableState(tableId);
        }
        break;
      
      case 'showdown':
        const result = table.showdown();
        handleTableShowdown(tableId, result);
        break;
      
      case 'getState':
        const state = table.getStateForPlayer(socket.id);
        socket.emit("state", state);
        break;

      case 'sitOut':
        if (table.sitOut(socket.id)) {
          updateTableState(tableId);
        }
        break;

      case 'sitIn':
        if (table.sitIn(socket.id)) {
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
    // Find first available table
    const tables = tableManager.getAllTablesInfo();
    const availableTable = tables.find(t => t.status !== 'full');
    
    if (!availableTable) {
      socket.emit("errorMessage", "No available tables");
      return;
    }

    // Use joinTable logic
    const currentTableId = tableManager.getPlayerTableId(socket.id);
    if (currentTableId) {
      socket.leave(currentTableId);
      tableManager.leaveTable(socket.id);
    }

    // Check balance
    const user = userStorage.getUser(socket.id);
    if (!user) {
        socket.emit("errorMessage", "Auth required");
        return;
    }
    if (user.balance < availableTable.config.buyIn) {
        socket.emit("errorMessage", "Insufficient balance");
        return;
    }

    const result = tableManager.joinTable(socket.id, availableTable.id, seat);
    
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
      const state = table.getStateForPlayer(socket.id);
      socket.emit("tableJoined", { tableId: availableTable.id, seat, state });
      updateTableState(availableTable.id);
      console.log(`[Table] ${socket.id} auto-joined ${availableTable.id} at seat ${seat}`);
    }
  });

  // ==========================================
  // Chat
  // ==========================================
  socket.on("sendChatMessage", (messageData) => {
    const tableId = tableManager.getPlayerTableId(socket.id);
    if (!tableId) {
      socket.emit("errorMessage", "You are not at a table");
      return;
    }

    const table = tableManager.getTable(tableId);
    if (!table) return;

    // Create full message with ID and timestamp
    const fullMessage = {
      ...messageData,
      id: `${socket.id}-${Date.now()}`,
      timestamp: Date.now(),
    };

    // Broadcast to all players at the table
    const playerIds = table.getAllPlayerIds();
    playerIds.forEach((playerId) => {
      io.to(playerId).emit("chatMessage", fullMessage);
    });

    console.log(`[Chat] ${tableId}: ${messageData.authorName}: ${messageData.text.substring(0, 50)}`);
  });

  // ==========================================
  // Disconnect
  // ==========================================
  socket.on("disconnect", async () => {
    console.log("[Socket] Player disconnected:", socket.id);
    
    const tableId = tableManager.getPlayerTableId(socket.id);
    if (tableId) {
      // Get chips before leaving
      const table = tableManager.getTable(tableId);
      const player = table?.getPlayer(socket.id);
      const chipsToReturn = player ? player.chips : 0;

      updateTableState(tableId);
      tableManager.handleDisconnect(socket.id);

      // Return chips to DB
      const user = userStorage.getUser(socket.id);
      if (user && chipsToReturn > 0) {
        try {
          await UserRepository.updateBalance(user.telegramId, chipsToReturn);
        } catch (error) {
          console.error("Failed to return chips on disconnect:", error);
        }
      }
    }
    
    userStorage.removeUser(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Poker server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎲 Tables will be initialized shortly...`);
});
