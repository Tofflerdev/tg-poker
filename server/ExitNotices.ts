/**
 * exit-reconnect D/F: "you were removed while you were away" notices.
 *
 * A reconnect-window expiry vacates the seat and refunds the stack while the player
 * is — by definition — not connected, so there is no socket to emit exitCompleted to.
 * The notice is parked here and drained by the auth handler on their next login, so
 * the balance never just silently changes under them.
 *
 * Best-effort by design: the map is in-process and does not survive a restart. The
 * money is already safe in the ledger (the cashout row) — only the message is lost,
 * and a deploy dropping a "your chips came back" toast is an acceptable trade for
 * not adding a table.
 *
 * Pattern source: server/GraceRegistry.ts (singleton-as-module + __resetForTests).
 */

export interface ExitNotice {
  tableId: string;
  refunded: number;
}

const notices = new Map<string /* telegramId */, ExitNotice>();

/** Park a notice for a player who was not connected when their exit settled. */
export function record(telegramId: string, notice: ExitNotice): void {
  notices.set(telegramId, notice);
  console.info('[Exit] notice parked telegramId=%s tableId=%s refunded=%d',
    telegramId, notice.tableId, notice.refunded);
}

/** Read and remove the notice (auth handler drains it exactly once). */
export function take(telegramId: string): ExitNotice | undefined {
  const notice = notices.get(telegramId);
  notices.delete(telegramId);
  return notice;
}

/** Test-only: empty the map between cases. */
export function __resetForTests(): void {
  notices.clear();
}
