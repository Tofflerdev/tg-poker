import { tableManager } from './TableManager.js';
import { UserRepository } from './db/UserRepository.js';
import * as PendingExits from './PendingExits.js';
import * as ExitNotices from './ExitNotices.js';
import prisma from './db/prisma.js';

/**
 * exit-reconnect D: single-window disconnect grace.
 *
 * Supersedes the two-stage design (30 s mid-hand / 120 s between-hands). Stage no
 * longer changes the deadline because chips are protected by SITTING THE PLAYER OUT
 * as soon as the hand they dropped in ends — not by keeping the window short. The
 * window is now a pure seat-holding policy, so one number does.
 *
 * Timeline of a disconnect:
 *   1. arm() — seat held, window starts.
 *   2. The hand in progress plays on; the turn timer still runs at FULL length,
 *      because the player may reconnect inside it and act themselves.
 *   3. onHandBoundary() — the hand ends → sit them out. Dealt out, no blinds, the
 *      bleed stops. Seat still held for the rest of the window.
 *   4. onExpire() — vacate + refund. They are sat out by now, so they are not in a
 *      hand and the checkpoint refundCurrentChips reads is fresh and true.
 *
 * Never vacates mid-hand: refundCurrentChips pays out the hand-boundary checkpoint,
 * which mid-hand still holds the PRE-hand stack (see plans/exit-reconnect-fix-plan.md
 * B2). If the hand outlives the window, expiry hands over to the deferred-exit path
 * (PendingExits) and the boundary settles it.
 *
 * The old mid-hand-expiry branch sat the player out, deleted the registry entry and
 * armed nothing — seat and chips were then held forever with no timer at all.
 * Observed in prod on 2026-07-15: "[Grace] expired mid-hand — sat out, seat held"
 * and no further event. The single window closes that.
 *
 * Test seams:
 *   __resetForTests() — between-cases cleanup
 *   __getInternalsForTests() — registry inspection
 */

/** Seat-holding window after a disconnect. Pure policy — chips are safe regardless. */
export const RECONNECT_WINDOW_MS = 120_000;

interface GraceEntry {
  timer: NodeJS.Timeout;
  expiresAt: number;
  tableId: string;
}

const registry = new Map<string /* telegramId */, GraceEntry>();

/**
 * Arm (or replace) the reconnect window for a telegramId.
 * Idempotent: a second call for the same tid clears the prior timer first.
 */
export function arm(telegramId: string, tableId: string): void {
  clear(telegramId);
  const timer = setTimeout(() => {
    void onExpire(telegramId);
  }, RECONNECT_WINDOW_MS);
  registry.set(telegramId, { timer, expiresAt: Date.now() + RECONNECT_WINDOW_MS, tableId });
  console.info('[Grace] armed telegramId=%s tableId=%s ms=%d', telegramId, tableId, RECONNECT_WINDOW_MS);
}

/**
 * Cancel the window and undo the disconnect sit-out. Idempotent (no-op if not armed).
 * Called from the auth handler and the joinTable resume branch — coming back stops
 * the clock AND puts the player back in the game.
 *
 * The sit-in is not optional. onHandBoundary sits a disconnected player out to stop
 * the blind bleed, but they never chose that, so returning has to undo it. Without
 * it they sit at the table dealt out of every hand with no way back — the client has
 * no sit-in button (the socket events exist, nothing emits them), so the only escape
 * would be leaving the table.
 *
 * Deliberately unconditional: today a sit-out can ONLY come from a disconnect, so
 * there is no player intent to preserve. A manual sit-out button (plan §G) would
 * change that and must bring a "sat out by choice" flag with it.
 */
export function clear(telegramId: string): void {
  const entry = registry.get(telegramId);
  if (!entry) return;
  clearTimeout(entry.timer);
  registry.delete(telegramId);

  const table = tableManager.getPlayerTable(telegramId);
  // Not for a player on their way out: markLeaving set sittingOut on purpose there,
  // and the boundary is about to cash them out.
  if (table && !PendingExits.isPending(telegramId)) {
    // Only undo an actual sit-out. Game.sitIn also sets owesBlind (blind-debt), so
    // calling it on a fast reconnect that never crossed a hand boundary would charge
    // the player a dead post for no reason.
    const seated = table.getState().seats.find((p) => p?.id === telegramId);
    if (seated?.sittingOut) {
      table.sitIn(telegramId);
      console.info('[Grace] cleared telegramId=%s — sat back in', telegramId);
      return;
    }
  }
  console.info('[Grace] cleared telegramId=%s', telegramId);
}

/** Is this player inside a reconnect window right now? */
export function isDisconnected(telegramId: string): boolean {
  return registry.has(telegramId);
}

/** Absolute deadline of the in-flight window, if any. */
export function expiresAt(telegramId: string): number | undefined {
  return registry.get(telegramId)?.expiresAt;
}

/**
 * Hand-boundary hook (called from setOnHandComplete).
 *
 * Sits out every player who is still inside a reconnect window, so that from the
 * next hand on they are dealt out and post no blinds. This is the whole reason the
 * window no longer needs to be short: a disconnected player stops bleeding chips
 * after at most one hand, however long they stay away.
 *
 * Deliberately does NOT touch disconnectedAt — they are still gone; the column is
 * cleared when they either return (auth) or are vacated (onExpire).
 */
export function onHandBoundary(telegramIds: string[]): void {
  for (const telegramId of telegramIds) {
    if (!registry.has(telegramId)) continue;
    const table = tableManager.getPlayerTable(telegramId);
    if (!table) continue;
    if (table.sitOut(telegramId)) {
      console.info('[Grace] sat out telegramId=%s — disconnected, seat held', telegramId);
    }
  }
}

async function onExpire(telegramId: string): Promise<void> {
  registry.delete(telegramId);
  const seatedTable = tableManager.getPlayerTable(telegramId);
  if (!seatedTable) {
    // Already gone (leaveTable from another tab, admin kick). Never recreate state.
    return;
  }

  // The hand they dropped in outlived the whole window (step 3 never ran). Vacating
  // now would refund the stale pre-hand checkpoint, so hand over to the deferred-exit
  // path instead and let the boundary settle it against a true checkpoint.
  if (seatedTable.isInHand(telegramId)) {
    seatedTable.markLeaving(telegramId);
    PendingExits.mark(telegramId, seatedTable.id, 'disconnected');
    console.info('[Grace] expired telegramId=%s mid-hand — deferred to hand boundary', telegramId);
    return;
  }

  const tableId = seatedTable.id;
  tableManager.leaveTable(telegramId);
  try {
    const result = await UserRepository.refundCurrentChips(telegramId);
    const refunded = result?.refunded ?? 0;
    // They are not connected (that is what expiry means), so park the notice for auth.
    ExitNotices.record(telegramId, { tableId, refunded });
    console.info('[Grace] expired telegramId=%s — vacated, refunded %d', telegramId, refunded);
  } catch (err) {
    console.error('[Grace] refund failed for telegramId=%s:', telegramId, err);
  }
  try {
    await prisma.user.update({
      where: { telegramId: BigInt(Number(telegramId)) },
      data: { disconnectedAt: null }
    });
  } catch (err) {
    console.error('[Grace] failed to clear disconnectedAt:', err);
  }
}

/** Test-only: cancel all timers and empty the registry. */
export function __resetForTests(): void {
  registry.forEach(entry => clearTimeout(entry.timer));
  registry.clear();
}

/** Test-only: read internal state for assertions. */
export function __getInternalsForTests() {
  return { registry };
}
