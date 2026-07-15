/**
 * exit-reconnect A: registry of table exits deferred to the next hand boundary.
 *
 * Why exits are deferred at all: refundCurrentChips pays out `currentChips`, which
 * is only written at hand boundaries (checkpointSeatedPlayers, decision D-17 — no
 * mid-hand state). Removing a player mid-hand therefore refunds their PRE-hand
 * stack while the chips they already committed are paid to the winner — the
 * difference is minted out of nothing. Deferring to the boundary means the
 * checkpoint the refund reads is always the player's true final stack.
 *
 * The player stays seated (and `leaving` + `sittingOut`) until settled, so:
 *   - the boundary checkpoint captures them (checkpointSeatedPlayers iterates
 *     evt.perPlayer = occupied seats),
 *   - their committed chips stay live and can still win the pot,
 *   - they are dealt out of the next hand regardless of settle timing.
 *
 * Pattern source: server/GraceRegistry.ts (singleton-as-module + __resetForTests).
 */

/** telegramId → tableId the exit was requested from. */
const pending = new Map<string, string>();

/** Mark an exit as awaiting the next hand boundary. Idempotent. */
export function mark(telegramId: string, tableId: string): void {
  pending.set(telegramId, tableId);
  console.info('[Exit] deferred telegramId=%s tableId=%s — settles at hand end', telegramId, tableId);
}

/** Is an exit in flight for this player? Used to refuse a re-seat mid-settle. */
export function isPending(telegramId: string): boolean {
  return pending.has(telegramId);
}

/** The table an in-flight exit belongs to, if any. */
export function tableOf(telegramId: string): string | undefined {
  return pending.get(telegramId);
}

/** Every telegramId with an exit pending on this table. */
export function forTable(tableId: string): string[] {
  return [...pending.entries()].filter(([, tid]) => tid === tableId).map(([id]) => id);
}

/** Remove the entry (call once the refund has been settled). Idempotent. */
export function clear(telegramId: string): void {
  pending.delete(telegramId);
}

/** Test-only: empty the registry between cases. */
export function __resetForTests(): void {
  pending.clear();
}

/** Test-only: read internal state for assertions. */
export function __getInternalsForTests() {
  return { pending };
}
