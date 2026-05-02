import type { Socket } from 'socket.io';
import type {
  ExtendedClientEvents,
  ExtendedServerEvents,
  SocketData,
} from '../../types/index.js';
import type { DefaultEventsMap } from 'socket.io';

/**
 * Phase 5 / Plan 05-01 (COMPLIANCE-04 / D-13 / D-14 / RESEARCH Open Q3).
 *
 * Server-side gate for joinTable. Returns true if the user may proceed to the
 * existing balance + seat flow; returns false and emits a typed `serverError`
 * to the caller's socket otherwise.
 *
 * Order: ban first (banned users never see the Consent screen), ToS second.
 *
 * The user object may be either the in-memory TelegramUser (server/models/User.ts)
 * or a Prisma User row — both carry `tosAcceptedAt` and `bannedAt`. We accept any
 * shape with those two fields so callers don't need to reshape.
 */
export interface JoinGateUser {
  tosAcceptedAt?: string | Date | null;
  bannedAt?: string | Date | null;
}

type GateSocket = Socket<
  ExtendedClientEvents,
  ExtendedServerEvents,
  DefaultEventsMap,
  SocketData
>;

export function gateUserOrEmit(user: JoinGateUser, socket: GateSocket): boolean {
  // D-RESEARCH-Q3: ban check first. A banned user is rejected even when ToS is missing.
  if (user.bannedAt) {
    socket.emit('serverError', { type: 'BANNED' });
    return false;
  }
  // D-13 / D-14: ALL users with no ToS acceptance are gated — no createdAt cutoff.
  if (!user.tosAcceptedAt) {
    socket.emit('serverError', { type: 'TOS_REQUIRED' });
    return false;
  }
  return true;
}
