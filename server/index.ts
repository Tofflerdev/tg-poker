import "dotenv/config";
import crypto from "crypto";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server, type DefaultEventsMap } from "socket.io";
import cors from 'cors';
import { validateCredentials, signAdminToken } from './admin/adminAuth.js';
import { setupAdminNamespace } from './admin/adminNamespace.js';
import { assertSafeBootOrExit, validateInitData, createUserFromInitData } from "./middleware/auth.js";
import { gateUserOrEmit } from "./middleware/joinGate.js";
import { userStorage } from "./models/User.js";
import { tableManager } from "./TableManager.js";
import { clampBuyIn } from "./config/tables.js";
import { BotDriver } from "./bot/BotDriver.js";
import { SessionRecorder } from "./bot/SessionRecorder.js";
import { UserRepository } from "./db/UserRepository.js";
import { isValidAvatarId } from "../types/avatars.js";
import * as HandHistoryQueue from "./HandHistoryQueue.js";
import { HandHistoryRepository } from "./db/HandHistoryRepository.js";
import { checkpointSeatedPlayers } from "./checkpointSeatedPlayers.js";
import * as GraceRegistry from "./GraceRegistry.js";
import * as PendingExits from "./PendingExits.js";
import * as SessionRecovery from "./SessionRecovery.js";
import prisma from "./db/prisma.js";
import * as Sentry from '@sentry/node';
import { PostHog } from 'posthog-node';
import { scrubSentryEvent } from './utils/scrubber.js';
import { initAnalytics, toAnalyticsId, shutdownAnalytics } from './utils/analytics.js';
import { RateLimiter } from './utils/rateLimit.js';
import type {
  TelegramUser,
  AuthPayload,
  ExtendedClientEvents,
  ExtendedServerEvents,
  SocketData,
} from "../types/index.js";

// Boot guard — exits with code 1 if the env is unsafe for production
assertSafeBootOrExit();

// Phase 5 / Plan 05-02 / OBS-01 / D-09: Sentry init guarded by SENTRY_DSN.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.npm_package_version,
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as any,
  });
  console.log('[Boot] Sentry initialized');
}

// Phase 5 / Plan 05-02 / OBS-03 / D-09: PostHog init guarded by POSTHOG_API_KEY.
if (process.env.POSTHOG_API_KEY) {
  const posthogClient = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST ?? 'https://app.posthog.com',
  });
  initAnalytics(posthogClient);
  console.log('[Boot] PostHog initialized');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Behind nginx in prod — trust the first proxy so req.ip reflects the real client
// IP (X-Forwarded-For) for rate limiting rather than the proxy's address.
app.set('trust proxy', 1);
const server = http.createServer(app);

// Rate limiters (audit #11). Fixed-window, in-memory.
// - admin login: 5 attempts / 15 min per IP — throttles password brute force.
// - chat: 5 messages / 5 s per player — throttles flood.
const adminLoginLimiter = new RateLimiter(5, 15 * 60 * 1000);
const chatLimiter = new RateLimiter(5, 5 * 1000);
const rateLimitSweep = setInterval(() => {
  adminLoginLimiter.sweep();
  chatLimiter.sweep();
}, 60 * 1000);
rateLimitSweep.unref?.();

// CORS: allow all in dev, restrict in production
const CORS_ORIGIN = process.env.NODE_ENV === 'production'
  ? ["https://tgp.isgood.host"]
  : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"];

// Phase 5 / Plan 05-03 / ADMIN-01 / Pitfall 1: register JSON body parser BEFORE
// any POST handlers. (Existing GET handlers don't need a body parser.)
app.use(express.json({ limit: '10kb' })); // small limit — login payload is tiny

// Phase 5 / Plan 05-03 / Pitfall 2: Express CORS for /api/admin/* routes.
// Mirrors the Socket.io CORS_ORIGIN list so the admin SPA's POST /api/admin/login
// preflight succeeds in dev (Vite on :5173) and prod (same origin).
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));

// Phase 5 / Plan 05-03 / ADMIN-01 / D-02: admin login REST endpoint. Issues an
// 8-hour JWT to a successful credential pair. Failure responses use a generic
// message — no oracle distinction between "wrong username" and "wrong password".
app.post('/api/admin/login', (req, res) => {
  // Rate limit by client IP to throttle credential brute force (audit #11).
  if (!adminLoginLimiter.take(req.ip ?? 'unknown')) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (!validateCredentials(username, password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  try {
    const token = signAdminToken(username as string);
    res.json({ token });
  } catch (err) {
    console.error('[adminLogin] signAdminToken failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

const io = new Server<ExtendedClientEvents, ExtendedServerEvents, DefaultEventsMap, SocketData>(server, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true
  },
});

// Phase 5 / Plan 05-04 / ADMIN-02 / D-06: mount the /admin namespace.
// JWT-authenticated; emits full adminState snapshot on connect; targeted delta
// events on subsequent admin actions. Player namespace at '/' is unaffected.
setupAdminNamespace(io, { broadcastTableState: (tableId: string) => updateTableState(tableId) });

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
 * exit-reconnect A: settle every exit deferred from mid-hand on this table.
 *
 * Called from setOnHandComplete AFTER checkpointSeatedPlayers has committed, so the
 * currentChips that refundCurrentChips pays out is the player's true final stack —
 * including any pot they won while auto-checking their way out.
 *
 * Failures are logged per player and never re-thrown: one bad refund must not stop
 * the others or the hand-complete pipeline.
 */
const settlePendingExits = async (tableId: string): Promise<void> => {
  const leaving = PendingExits.forTable(tableId);
  if (leaving.length === 0) return;

  for (const telegramId of leaving) {
    try {
      tableManager.leaveTable(telegramId);
      const result = await UserRepository.refundCurrentChips(telegramId);
      const user = userStorage.getUser(telegramId);
      let balance: number | undefined;
      if (user) {
        const refreshed = await UserRepository.findByTelegramId(user.telegramId);
        if (refreshed) {
          user.balance = refreshed.balance;
          balance = refreshed.balance;
        }
      }
      const socketId = getSocketId(telegramId);
      if (socketId && balance !== undefined) {
        io.to(socketId).emit("balanceUpdate", balance);
        io.to(socketId).emit("exitCompleted", {
          tableId,
          refunded: result?.refunded ?? 0,
          balance,
        });
      }
      console.log(`[Exit] settled telegramId=${telegramId} tableId=${tableId} refunded=${result?.refunded ?? 0}`);
    } catch (err) {
      console.error('[Exit] settle failed for telegramId=%s:', telegramId, err);
    } finally {
      PendingExits.clear(telegramId);
    }
  }
  updateTableState(tableId);
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

  // Single chokepoint for the playtest BotDriver: every state broadcast (human
  // action, turn timeout, new hand, bot action) re-checks whether it's now a
  // bot's turn and schedules its action. Never throws back into the broadcast.
  botDriver.notifyStateChanged(tableId);
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

/**
 * Settle a table after an action: run showdown handling if the hand ended,
 * otherwise just broadcast state. Module-level so both socket action handlers
 * and the BotDriver share one post-action path.
 */
const settleAndBroadcast = (tableId: string) => {
  const table = tableManager.getTable(tableId);
  if (!table) return;
  const state = table.getState();
  if (state.stage === 'showdown' && table.game?.lastShowdown) {
    handleTableShowdown(tableId, table.game.lastShowdown);
  } else {
    updateTableState(tableId);
  }
};

// Playtest BotDriver — acts on `isBot` seats via the same Table action methods
// the socket handlers use, then settles/broadcasts (which chains bot-to-bot).
const botDriver = new BotDriver({
  getTable: (tableId) => tableManager.getTable(tableId),
  onActed: (tableId) => settleAndBroadcast(tableId),
});

// Playtest session recorder — appends actions + hand results to sessions/*.jsonl
// for offline oracle/analysis. Gated by RECORD_SESSIONS so it's a no-op unless
// explicitly enabled on the playtest box. One file per process run, lazy-created.
const sessionRecorder = new SessionRecorder({
  enabled: process.env.RECORD_SESSIONS === '1' || process.env.RECORD_SESSIONS === 'true',
});

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

  table.setOnPlayerAction((evt) => {
    // Playtest recorder (best-effort, no-op unless RECORD_SESSIONS is set).
    sessionRecorder.recordAction(evt);
    // Phase 3 / Plan 03-01 (D-01, D-09): synchronous fan-out of actionBubble to
    // every authenticated socket at this table. Mirrors updateTableState's
    // telegramId → socketId resolution. Wrapped in try/catch so a transport
    // hiccup never propagates back into Game.ts (T-3-SCHEMA / Risk #6).
    try {
      const playerIds = table.getAllPlayerIds(); // telegramIds
      playerIds.forEach((telegramId) => {
        const sid = getSocketId(telegramId);
        if (sid) {
          io.to(sid).emit('actionBubble', evt);
        }
      });
    } catch (err) {
      console.error('[ActionBubble] broadcast error:', err);
    }
  });

  table.setOnHandComplete((evt) => {
    // Phase 3 / Plan 03-02 (D-09 sync, D-14 separate paths, RESEARCH gotcha #6):
    // Game.ts ignores the listener's return value, so we wrap async work in
    // a fire-and-forget IIFE with try/catch so an unhandled rejection never
    // escapes back into the game loop.
    // Playtest recorder (best-effort, no-op unless RECORD_SESSIONS is set).
    sessionRecorder.recordHandComplete(evt);
    void (async () => {
      try {
        // (1) Best-effort hand history — fan-in to the async batched queue.
        evt.perPlayer.forEach((p) => {
          HandHistoryQueue.enqueue(HandHistoryRepository.toWriteRow(evt, p));
        });
        // (1b) crypto-payments-rake phase 2: record the hand's rake in the ledger.
        // breakdown splits the rake across contributors proportional to what each
        // put in the pot (floor; rounding remainder assigned to the largest
        // contributor) — a rakeback hook that never needs a schema change.
        if (evt.rake && evt.rake > 0) {
          const contributors = evt.perPlayer
            .map((p) => ({ telegramId: p.telegramId, contributed: p.contributed ?? 0 }))
            .filter((c) => c.contributed > 0);
          const totalContributed = contributors.reduce((s, c) => s + c.contributed, 0);
          const breakdown: Record<string, number> = {};
          if (totalContributed > 0) {
            let assigned = 0;
            for (const c of contributors) {
              const share = Math.floor((evt.rake * c.contributed) / totalContributed);
              breakdown[c.telegramId] = share;
              assigned += share;
            }
            const leftover = evt.rake - assigned;
            if (leftover > 0) {
              const top = [...contributors].sort((a, b) => b.contributed - a.contributed)[0];
              breakdown[top.telegramId] = (breakdown[top.telegramId] ?? 0) + leftover;
            }
          }
          await UserRepository.recordRake(evt.rake, {
            handId: evt.handId,
            tableId: evt.tableId,
            breakdown,
          });
        }
        // (2) Authoritative chip/seat checkpoint — separate awaited path (D-14).
        await checkpointSeatedPlayers(evt);
        // (2a) exit-reconnect A: settle exits deferred from mid-hand. MUST run after
        // the checkpoint above — that write is what makes currentChips the player's
        // true final stack, which is exactly what the refund pays out. On a checkpoint
        // failure we fall into catch and skip settling rather than refund a stale value.
        await settlePendingExits(evt.tableId);
        // (2b) Profile stats (audit #12). Skip bots (negative telegramId) and
        // players not dealt into this hand (no hole cards). winnings = netDelta.
        await Promise.all(
          evt.perPlayer
            .filter((p) => Number(p.telegramId) > 0 && p.holeCards.length > 0)
            .map((p) => UserRepository.updateStats(Number(p.telegramId), p.won, p.netDelta))
        );
        // Phase 4 / Plan 04-06 / Pitfall 1: every per-player entry that is still in
        // mid-hand grace must be promoted to between-hands grace, so the 30 s
        // mid-hand timer doesn't spuriously fire AFTER the hand they disconnected
        // from has ended. reArmIfMidHand is a no-op when no entry exists.
        evt.perPlayer.forEach((p) => {
          GraceRegistry.reArmIfMidHand(p.telegramId);
        });
      } catch (err) {
        console.error('[onHandComplete] checkpoint or enqueue error:', err);
      }
    })();
  });
};

// Initialize table events for all predefined tables, then start the
// HandHistoryQueue flush timer and the 90-day retention sweep.
setTimeout(async () => {
  const tables = tableManager.getAllTablesInfo();
  tables.forEach((t) => setupTableEvents(t.id));

  // Phase 4 / Plan 04-06 / D-C2: boot-time session recovery sweep.
  // Refunds every persisted session row (currentTableId IS NOT NULL) and
  // clears the session columns. Always-refund (D-C1) — no reseat path in v1.
  try {
    const result = await SessionRecovery.recoverPersistedSessions();
    console.log('[Boot] SessionRecovery refunded %d session(s)', result.recovered);
  } catch (err) {
    console.error('[Boot] SessionRecovery failed:', err);
    // Non-fatal — server continues to listen.
  }

  HandHistoryQueue.startFlushTimer();
  HandHistoryQueue.startRetentionJob();
  console.log('[Boot] HandHistoryQueue + retention job started');
}, 1000);

// Graceful shutdown: drain the HandHistoryQueue + analytics before exit so in-flight
// best-effort history rows and PostHog batches are not lost. RESEARCH §"SIGTERM wiring".
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received — draining HandHistoryQueue + analytics...');
  try { await HandHistoryQueue.shutdown(); } catch (err) { console.error('[Server] queue drain failed:', err); }
  try { await shutdownAnalytics(); } catch (err) { console.error('[Server] analytics drain failed:', err); }
  try { await sessionRecorder.close(); } catch (err) { console.error('[Server] recorder close failed:', err); }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received — draining HandHistoryQueue + analytics...');
  try { await HandHistoryQueue.shutdown(); } catch (err) { console.error('[Server] queue drain failed:', err); }
  try { await shutdownAnalytics(); } catch (err) { console.error('[Server] analytics drain failed:', err); }
  try { await sessionRecorder.close(); } catch (err) { console.error('[Server] recorder close failed:', err); }
  process.exit(0);
});

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

      // Wire eviction: if a prior socket is mapped for this telegramId, disconnect it.
      // Phase 4 / Plan 04-06 / D-A3: typed bare event (no payload), then disconnect.
      tableManager.setSocketForTelegram(
        telegramId,
        socket.id,
        (priorSocketId) => {
          const prior = io.sockets.sockets.get(priorSocketId);
          if (prior) {
            prior.emit('replacedBySession');
            prior.disconnect(true);
          }
        }
      );

      // Phase 4 / Plan 04-06 / D-A2: if the player was already seated (reconnect),
      // push a personalized tableJoined + state snapshot to the new socket and
      // refresh other seats. Reuses existing events — no new event type.
      // getStateForPlayer(telegramId) is used here (NOT getState()) so the snapshot
      // contains only this player's own hole cards — same privacy path as regular state push.
      // exit-reconnect F: a leaving player is still seated until the boundary refund,
      // so skip the resume snapshot for them — restoring them into a table they are
      // in the middle of leaving would only strand them there until the settle fires.
      const seatedTable = PendingExits.isPending(telegramId)
        ? undefined
        : tableManager.getPlayerTable(telegramId);
      if (seatedTable) {
        seatedTable.updatePlayerSocketId(telegramId, socket.id);
        const state = seatedTable.getStateForPlayer(telegramId);
        const seatIdx = state.seats.findIndex(p => p?.id === telegramId);
        socket.emit("tableJoined", { tableId: seatedTable.id, seat: seatIdx, state });
        updateTableState(seatedTable.id);
        // D-B clear: a successful auth means the player is back; cancel any in-flight grace timer.
        GraceRegistry.clear(telegramId);
      }

      // Phase 5 / Plan 05-02 / OBS-03 / D-12: analyticsId = sha256(telegramId). Server
      // computes and ships it once; client uses it for PostHog identify. Raw telegramId
      // is never sent to PostHog. The field is additive; existing client logic ignores it.
      const userWithAnalytics = { ...user, analyticsId: toAnalyticsId(user.telegramId) };
      socket.emit("authSuccess", userWithAnalytics);
      console.log("[Auth] Success for:", user.username || user.displayName || user.telegramId,
        payload.devId ? `(dev mode, devId=${payload.devId})` : '');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[Auth] Error for socket:", socket.id, "| Error:", errorMsg);
      // Dump the full error object so Prisma details (code, meta, cause) are visible.
      console.error("[Auth] Full error:", error);
      if (error instanceof Error && error.stack) {
        console.error("[Auth] Stack:", error.stack);
      }

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

  // Phase 3 / Plan 03-04 (PROFILE-03, PROFILE-04): hand-history reader.
  // SECURITY (T-3-AUTHZ): the requesting user is identified ONLY from
  // socket.data.telegramId (set during Phase 1 auth). NO client payload is
  // accepted — even if the client emits with arguments, they are ignored.
  // SECURITY (T-3-DOS): the row cap is enforced server-side inside
  // HandHistoryRepository.findForUser (default 50; clamps any larger value).
  // SECURITY (T-3-INFO-LEAK): on Prisma error, the raw error is logged to
  // stderr but NEVER returned to the client; the client receives only a
  // generic 'Server error' string.
  socket.on("getHandHistory", async () => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }
    try {
      const rows = await HandHistoryRepository.findForUser(telegramId);
      socket.emit("handHistoryData", rows);
    } catch (error) {
      console.error("[HandHistory] Error:", error);
      socket.emit("handHistoryError", "Server error");
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

  // Plan 02-08: persist ToS acceptance for the authenticated user.
  // T-02-08-01: require populated socket.data.telegramId (auth gate).
  // T-02-08-02: reject payloads where `version` is not a non-empty string
  //             of length ≤ 16 (ASVS V5 input validation).
  // D-27 / COMPLIANCE-02: writes tosAcceptedAt = now(), tosVersion = payload.version
  //                       and emits tosAccepted ack so the client can close the gate.
  socket.on("acceptTos", async (payload) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      // Un-authed socket — silent drop (matches updateAvatar pattern).
      console.warn("[AcceptTos] rejected: unauthenticated socket.id=%s", socket.id);
      return;
    }

    if (
      !payload ||
      typeof payload.version !== 'string' ||
      payload.version.length === 0 ||
      payload.version.length > 16
    ) {
      console.warn(
        "[AcceptTos] rejected invalid payload from telegramId=%s payload=%o",
        telegramId,
        payload
      );
      return; // silent drop — do not echo tampered input back
    }

    const user = userStorage.getUser(telegramId);
    if (!user) return;

    try {
      const result = await UserRepository.acceptTos(user.telegramId, payload.version);

      // Mirror into in-memory session so subsequent reads (e.g. updateProfile
      // echo) see the accepted state without a DB round-trip.
      user.tosAcceptedAt = result.tosAcceptedAt.toISOString();

      socket.emit("tosAccepted", {
        tosAcceptedAt: result.tosAcceptedAt.toISOString(),
        tosVersion: result.tosVersion
      });
      console.log("[AcceptTos] telegramId=%s accepted version=%s", telegramId, result.tosVersion);
    } catch (error) {
      console.error("[AcceptTos] Error:", error);
      // No client-facing error event — consent flow retries by user tap.
    }
  });

  // Plan 02-02: persist an avatar slug chosen by the user.
  // T-02-02-01: require populated socket.data.telegramId.
  // T-02-02-02: reject slugs not in the AVATARS allowlist (ASVS V5).
  socket.on("updateAvatar", async (payload) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }

    if (!payload || !isValidAvatarId(payload.avatarId)) {
      console.warn("[UpdateAvatar] rejected invalid avatarId from telegramId=%s payload=%o", telegramId, payload);
      return; // silent drop — do not echo tampered input back
    }

    const user = userStorage.getUser(telegramId);
    if (!user) return;

    try {
      await UserRepository.updateAvatarId(user.telegramId, payload.avatarId);
      user.avatarId = payload.avatarId;

      // Ack to sender
      socket.emit("avatarUpdated", { avatarId: payload.avatarId });

      // If the user is seated, broadcast so other clients at the same table
      // see the new avatar in SeatsDisplay without waiting for the next hand.
      const seatedTable = tableManager.getPlayerTable(telegramId);
      if (seatedTable) {
        const player = seatedTable.getPlayer(telegramId);
        if (player) {
          player.avatarId = payload.avatarId;
        }
        updateTableState(seatedTable.id);
      }
    } catch (error) {
      console.error("[UpdateAvatar] Error:", error);
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
  socket.on("joinTable", async (payload: { tableId: string; seat: number; buyInAmount?: number }) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit("authError", { message: 'Not authenticated' } as any);
      return;
    }

    const { tableId, seat, buyInAmount } = payload;
    const user = userStorage.getUser(telegramId);

    if (!user) {
      socket.emit("errorMessage", "Authentication required");
      return;
    }

    // Phase 5 / Plan 05-01 / COMPLIANCE-04 / D-13 / D-14 + Open Q3 ban check.
    // gateUserOrEmit emits the typed `serverError` payload itself; we just bail out.
    if (!gateUserOrEmit(user, socket)) {
      return;
    }

    const tableInfo = tableManager.getTable(tableId);

    // exit-reconnect F: an exit is still settling. This MUST be checked before the
    // resume branch below: a leaving player is deliberately still seated (the seat is
    // held until the boundary refund), so isSeated() is true for them and they would
    // be resumed here — only to be yanked out and cashed out a moment later.
    if (PendingExits.isPending(telegramId)) {
      socket.emit("tableError", "Finishing your last hand — your chips are on the way back. Try again in a moment.");
      return;
    }

    // exit-reconnect E / B1: RESUME, never re-seat. A player already sitting at this
    // table who emits joinTable again (reconnect, second tab, stale client) must get
    // their existing seat back — not a fresh buy-in. The old code fell through to the
    // "leave current table" branch below, which drops the in-memory player WITHOUT
    // refundCurrentChips: the held stack was destroyed and the balance debited again.
    // Checked against the live seats, not playerToTable — a busted player stays mapped
    // to the table as a spectator and must still be able to re-buy.
    if (tableInfo && tableInfo.isSeated(telegramId)) {
      socket.join(tableId);
      GraceRegistry.clear(telegramId);
      tableInfo.updatePlayerSocketId(telegramId, socket.id);
      const state = tableInfo.getStateForPlayer(telegramId);
      const seatIdx = state.seats.findIndex((p) => p?.id === telegramId);
      socket.emit("tableJoined", { tableId, seat: seatIdx, state });
      updateTableState(tableId);
      console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) resumed ${tableId} at seat ${seatIdx}`);
      return;
    }

    // crypto-payments-rake phase 3: buy-in is a range. Clamp the requested amount
    // to [minBuyIn, maxBuyIn] (defaulting to maxBuyIn) and check the balance
    // against that. The authoritative seated amount comes back from joinTable.
    if (tableInfo) {
      const cfg = tableInfo.config;
      const effectiveBuyIn = clampBuyIn(buyInAmount, cfg);
      if (user.balance < effectiveBuyIn) {
        socket.emit("tableError", `Insufficient balance. Buy-in for this table is ${cfg.minBuyIn}–${cfg.maxBuyIn}.`);
        return;
      }
    }

    // exit-reconnect B1: leaving for a DIFFERENT table must cash the old seat out.
    // tableManager.leaveTable alone only drops the in-memory player — the stack would
    // vanish with no cashout row and the balance would be debited again for the new seat.
    const currentTableId = tableManager.getPlayerTableId(telegramId);
    if (currentTableId) {
      socket.leave(currentTableId);
      const oldTable = tableManager.getTable(currentTableId);
      if (oldTable && oldTable.isInHand(telegramId)) {
        // Mid-hand: defer exactly as a plain leave would, and refuse the new seat for
        // now — the refund lands at the boundary and the player can join then.
        oldTable.markLeaving(telegramId);
        PendingExits.mark(telegramId, currentTableId);
        updateTableState(currentTableId);
        socket.emit("exitPending", { tableId: currentTableId });
        socket.emit("tableError", "Finishing your last hand at your current table — try again in a moment.");
        return;
      }
      tableManager.leaveTable(telegramId);
      updateTableState(currentTableId);
      try {
        const refund = await UserRepository.refundCurrentChips(telegramId);
        if (refund) {
          const refreshed = await UserRepository.findByTelegramId(user.telegramId);
          if (refreshed) {
            user.balance = refreshed.balance;
            socket.emit("balanceUpdate", refreshed.balance);
          }
        }
      } catch (err) {
        console.error('[Table] refund on table switch failed:', err);
        socket.emit("tableError", "Could not cash out your current table. Try again.");
        return;
      }
    }

    // Join new table (seats with the clamped buy-in; returns the exact chips seated)
    const result = tableManager.joinTable(telegramId, tableId, seat, buyInAmount);

    if (!result.success) {
      socket.emit("tableError", result.error || "Failed to join table");
      return;
    }

    // Phase 4 / Plan 04-06 / D-D1, D-D2: atomic buy-in with insufficient-funds guard.
    // Deduct EXACTLY the chips that were seated (result.buyIn) so balance and
    // in-play chips stay in lock-step. Closes Concern #5 (double-spend race).
    const seatedBuyIn = result.buyIn ?? tableInfo!.config.maxBuyIn;
    // exit-reconnect B3: the session trio is written in the same transaction as the
    // debit, so currentChips is never NULL/stale between sitting down and the first
    // hand-boundary checkpoint (a leave in that window used to refund nothing).
    const ok = await UserRepository.tryDecrementBalance(user.telegramId, seatedBuyIn, { tableId }, {
      tableId,
      seat: result.seat!,
    });
    if (!ok) {
      // Roll back the in-memory join (player was added by tableManager.joinTable above).
      socket.leave(tableId);
      tableManager.leaveTable(telegramId);
      socket.emit("tableError", `Insufficient balance. Buy-in for this table is ${tableInfo!.config.minBuyIn}–${tableInfo!.config.maxBuyIn}.`);
      return;
    }
    // Reflect new balance to the client (updateMany doesn't return the row).
    const refreshed = await UserRepository.findByTelegramId(user.telegramId);
    if (refreshed) {
      user.balance = refreshed.balance;
      socket.emit("balanceUpdate", refreshed.balance);
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
    if (!tableId) return;

    // exit-reconnect A / B2: a mid-hand exit NEVER vacates now. refundCurrentChips
    // pays out the hand-boundary checkpoint, i.e. the stack from BEFORE this hand's
    // bets — while Game.removePlayer leaves those bets in the pot for the winner.
    // Refunding both mints chips. Hold the seat, auto-act for them (Game.markLeaving
    // sets `leaving`, so startTurnTimer acts instantly), and settle at the boundary
    // once the checkpoint reflects their true final stack.
    const table = tableManager.getTable(tableId);
    if (table && table.isInHand(telegramId)) {
      table.markLeaving(telegramId);
      PendingExits.mark(telegramId, tableId);
      GraceRegistry.clear(telegramId);
      socket.leave(tableId);
      socket.emit("exitPending", { tableId });
      socket.emit("tableLeft");
      updateTableState(tableId);
      console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) leaving ${tableId} — settles at hand end`);
      return;
    }

    // Between hands there is nothing to play out and the checkpoint is already
    // authoritative, so the exit settles immediately.
    socket.leave(tableId);
    tableManager.leaveTable(telegramId);
    socket.emit("tableLeft");
    updateTableState(tableId);
    console.log(`[Table] telegramId=${telegramId} (socket ${socket.id}) left ${tableId}`);

    // Phase 4 / Plan 04-06 / D-D2: atomic + idempotent refund. Reads currentChips
    // from the User row (NOT in-memory player state). Clears all session columns.
    // Cancel any in-flight grace timer (the player chose to leave, not got disconnected).
    GraceRegistry.clear(telegramId);
    try {
      const result = await UserRepository.refundCurrentChips(telegramId);
      if (result) {
        const user = userStorage.getUser(telegramId);
        if (user) {
          const refreshed = await UserRepository.findByTelegramId(user.telegramId);
          if (refreshed) {
            user.balance = refreshed.balance;
            socket.emit("balanceUpdate", refreshed.balance);
            socket.emit("exitCompleted", { tableId, refunded: result.refunded, balance: refreshed.balance });
          }
        }
      }
    } catch (error) {
      console.error("Failed to refund chips:", error);
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
        // Валидация на входе (defense-in-depth; Game.raise тоже проверяет).
        if (!Number.isSafeInteger(amount) || amount <= 0) {
          socket.emit("errorMessage", "Invalid raise amount");
          break;
        }
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

  const checkShowdownAndUpdate = (_table: any, tableId: string) => {
    settleAndBroadcast(tableId);
  };

  // Game action handlers
  socket.on("getState", () => handleGameAction('getState'));
  socket.on("fold", () => handleGameAction('fold'));
  socket.on("check", () => handleGameAction('check'));
  socket.on("call", () => handleGameAction('call'));
  socket.on("raise", (amount: number) => handleGameAction('raise', amount));
  socket.on("allIn", () => handleGameAction('allIn'));
  socket.on("showCards", () => handleGameAction('showCards'));
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
    // Legacy quick-join: no amount picker, so buy in for the table minimum
    // (cheapest safe default). Phase 3 range still applies via joinTable clamp.
    if (user.balance < availableTable.config.minBuyIn) {
      socket.emit("errorMessage", "Insufficient balance");
      return;
    }

    const result = tableManager.joinTable(telegramId, availableTable.id, seat, availableTable.config.minBuyIn);

    if (!result.success) {
      socket.emit("errorMessage", result.error || "Failed to join table");
      return;
    }

    // Phase 4 / Plan 04-06 / D-D2: same atomic buy-in pattern as joinTable.
    // exit-reconnect B3: seat the session trio in the same transaction (see joinTable).
    const seatedBuyIn2 = result.buyIn ?? availableTable.config.minBuyIn;
    const ok2 = await UserRepository.tryDecrementBalance(
      user.telegramId,
      seatedBuyIn2,
      { tableId: availableTable.id },
      { tableId: availableTable.id, seat: result.seat! },
    );
    if (!ok2) {
      socket.leave(availableTable.id);
      tableManager.leaveTable(telegramId);
      socket.emit("errorMessage", "Insufficient balance");
      return;
    }
    const refreshed2 = await UserRepository.findByTelegramId(user.telegramId);
    if (refreshed2) {
      user.balance = refreshed2.balance;
      socket.emit("balanceUpdate", refreshed2.balance);
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

    // Rate limit per player to throttle flood (audit #5/#11).
    if (!chatLimiter.take(telegramId)) {
      return; // silent drop — client will just see its message not appear
    }

    const tableId = tableManager.getPlayerTableId(telegramId);
    if (!tableId) {
      socket.emit("errorMessage", "You are not at a table");
      return;
    }

    const table = tableManager.getTable(tableId);
    if (!table) return;

    // SECURITY (audit #5): never trust client-supplied authorId/authorName — that
    // allowed impersonation (posting as another player or as "System"). Take only
    // the text from the payload and derive identity from the authenticated session.
    const rawText = typeof messageData?.text === 'string' ? messageData.text : '';
    const text = rawText.trim().slice(0, 300); // cap length; reject empty below
    if (text.length === 0) return;

    const user = userStorage.getUser(telegramId);
    if (!user) return;

    const fullMessage = {
      // Opaque id — no raw telegramId leaked to other clients (audit #5).
      id: crypto.randomUUID(),
      // authorId = internal DB id (matches client's currentUser.id own-message check),
      // NOT the telegram id.
      authorId: user.id,
      authorName: user.displayName || user.username || 'Player',
      text,
      type: 'player' as const,
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

    console.log(`[Chat] ${tableId}: ${fullMessage.authorName}: ${text.substring(0, 50)}`);
  });

  // ==========================================
  // Disconnect (Phase 4 / Plan 04-06 / D-B1, D-B2)
  // ==========================================
  socket.on("disconnect", async () => {
    console.log("[Socket] Player disconnected:", socket.id);

    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      // Socket never authenticated — nothing to clean up.
      return;
    }

    // Clear transport handle on the seated player (seat is HELD per D-B1).
    const seatedTable = tableManager.getPlayerTable(telegramId);
    if (seatedTable) {
      seatedTable.updatePlayerSocketId(telegramId, undefined);

      // D-B1, D-B2: stage-aware grace arming. NO immediate leave, NO immediate refund.
      // The existing Game.TURN_TIME_LIMIT auto-fold continues independently.
      // Table.getState() returns the full unpersonalized GameState — stage field
      // is identical to getStateForPlayer().stage and does not leak hole cards.
      const stage = seatedTable.getState().stage;
      const graceStage: 'mid-hand' | 'between-hands' =
        (stage === 'waiting' || stage === 'showdown') ? 'between-hands' : 'mid-hand';

      // Mark disconnectedAt + lastSeenAt for ops/debug visibility.
      try {
        await prisma.user.update({
          where: { telegramId: BigInt(Number(telegramId)) },
          data: { disconnectedAt: new Date(), lastSeenAt: new Date() }
        });
      } catch (err) {
        console.error('[Disconnect] failed to mark disconnectedAt:', err);
      }

      GraceRegistry.arm(telegramId, graceStage, seatedTable.id);
      updateTableState(seatedTable.id);
    }

    // Identity guard preserved (T-01-04-04 / Pitfall 4): only clear socket mapping
    // if THIS socket is still the current one for this telegramId. An evicted
    // (prior) socket's disconnect must NOT wipe the new socket's mapping.
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
