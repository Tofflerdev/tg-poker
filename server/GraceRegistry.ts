import { tableManager } from './TableManager.js';
import { UserRepository } from './db/UserRepository.js';
import prisma from './db/prisma.js';

/**
 * Plan 04-02 / RESILIENCE-05 / D-B1..D-B3:
 * Singleton-as-module grace-timer registry for disconnect-resume.
 *
 * - On disconnect, the auth handler (Plan 04-06) calls arm(tid, stage, tableId).
 * - On reconnect, the auth handler calls clear(tid).
 * - On hand-end, the setOnHandComplete listener (Plan 04-06) calls reArmIfMidHand(tid)
 *   for every still-disconnected seated player so a mid-hand 30 s timer doesn't
 *   spuriously vacate a player AFTER the hand they disconnected from has ended
 *   (Pitfall 1 from RESEARCH.md).
 *
 * Pattern source: server/HandHistoryQueue.ts (singleton-as-module + __resetForTests).
 *
 * Test seams:
 *   __resetForTests() — between-cases cleanup
 *   __getInternalsForTests() — registry inspection
 */

const MID_HAND_GRACE_MS = 30_000;        // D-B2
const BETWEEN_HANDS_GRACE_MS = 120_000;  // D-B2

export type GraceStage = 'mid-hand' | 'between-hands';

interface GraceEntry {
  timer: NodeJS.Timeout;
  stage: GraceStage;
  expiresAt: number;
  tableId: string;
}

const registry = new Map<string /* telegramId */, GraceEntry>();

/**
 * Arm (or replace) the grace timer for a telegramId.
 * Idempotent: a second call for the same tid clears the prior timer first
 * — no leak even under churn (Assumption A4 / Pitfall 4).
 */
export function arm(telegramId: string, stage: GraceStage, tableId: string): void {
  clear(telegramId);
  const ms = stage === 'mid-hand' ? MID_HAND_GRACE_MS : BETWEEN_HANDS_GRACE_MS;
  const timer = setTimeout(() => {
    void onExpire(telegramId, stage);
  }, ms);
  registry.set(telegramId, { timer, stage, expiresAt: Date.now() + ms, tableId });
  console.info('[Grace] armed telegramId=%s stage=%s tableId=%s ms=%d', telegramId, stage, tableId, ms);
}

/**
 * Cancel the grace timer for a telegramId. Idempotent (no-op if not armed).
 * Called from:
 *   - Auth handler on successful reconnect (D-B intent: reconnect = stop the clock)
 *   - Internally from arm() to replace prior entry
 */
export function clear(telegramId: string): void {
  const entry = registry.get(telegramId);
  if (!entry) return;
  clearTimeout(entry.timer);
  registry.delete(telegramId);
  console.info('[Grace] cleared telegramId=%s', telegramId);
}

/**
 * Read-only inspection of the current stage for a telegramId.
 * Used by the disconnect handler (Plan 04-06) to log / decide.
 */
export function getStage(telegramId: string): GraceStage | undefined {
  return registry.get(telegramId)?.stage;
}

/**
 * Re-arm hook called from setOnHandComplete (Plan 04-06).
 * If a mid-hand 30 s timer is still running when the hand ends, swap to a fresh
 * 120 s between-hands timer — preserves the player's seat for the next hand
 * instead of vacating them mid-grace AFTER the hand they disconnected from
 * already ended (Pitfall 1).
 *
 * No-op when:
 *   - no entry exists (player not in grace)
 *   - entry is already 'between-hands' (already counted; don't reset the clock)
 */
export function reArmIfMidHand(telegramId: string): void {
  const entry = registry.get(telegramId);
  if (!entry) return;
  if (entry.stage !== 'mid-hand') return;
  arm(telegramId, 'between-hands', entry.tableId);
}

async function onExpire(telegramId: string, stage: GraceStage): Promise<void> {
  registry.delete(telegramId);
  const seatedTable = tableManager.getPlayerTable(telegramId);
  if (!seatedTable) {
    // Player already left (e.g., another tab triggered leaveTable, or admin kick).
    // Race-safe per Pitfall 6 — onExpire never recreates state.
    return;
  }

  if (stage === 'mid-hand') {
    // D-B3: KEEP seat. Set sittingOut. Clear disconnectedAt. Don't touch chips.
    seatedTable.sitOut(telegramId);
    try {
      await prisma.user.update({
        where: { telegramId: BigInt(Number(telegramId)) },
        data: { disconnectedAt: null }
      });
    } catch (err) {
      console.error('[Grace] failed to clear disconnectedAt:', err);
    }
    console.info('[Grace] expired mid-hand telegramId=%s — sat out, seat held', telegramId);
  } else {
    // D-B3: VACATE seat. Refund chips atomically (Plan 04-01).
    tableManager.leaveTable(telegramId);
    try {
      const result = await UserRepository.refundCurrentChips(telegramId);
      console.info('[Grace] expired between-hands telegramId=%s — refunded %d', telegramId, result?.refunded ?? 0);
    } catch (err) {
      console.error('[Grace] refund failed for telegramId=%s:', telegramId, err);
    }
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
