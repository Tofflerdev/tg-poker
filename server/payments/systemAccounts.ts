/**
 * crypto-payments-rake phase 4 — reserved system account ids (plan §H, §K).
 *
 * Real Telegram ids are positive (≥ 1). Playtest bots use the negative range
 * starting at -1 and counting down (see server/bot/botRegistry.ts). System
 * accounts carve out fixed, well-known ids that neither a real user nor a bot
 * seat can ever take:
 *
 *   - House (§H): telegramId = 0. Rake profit accrues here.
 *   - Bot bankroll (§K): a large reserved negative id, far below the practical
 *     bot-seat range, and explicitly excluded from acquireBotIdentity so no bot
 *     ever seats under it. Holds the float that funds bot buy-ins on live tables.
 *
 * Both are held on the same `User` table as ordinary balances so the money
 * invariant (plan §H/§K) is a plain sum over `users.balance` plus chips in play.
 * They must be excluded from leaderboards/stats/search and blocked from login.
 */

/** House account — accumulates rake profit (plan §H). */
export const HOUSE_TELEGRAM_ID = 0;

/**
 * Bot bankroll account — float that funds bot buy-ins for live-table "massovka"
 * (plan §K). Reserved far below the -1… bot-seat range; acquireBotIdentity skips it.
 */
export const BOT_BANKROLL_TELEGRAM_ID = -1_000_000;

/** All reserved system ids — never handed out to a bot seat, never allowed to log in. */
export const RESERVED_SYSTEM_IDS: ReadonlySet<number> = new Set([
  HOUSE_TELEGRAM_ID,
  BOT_BANKROLL_TELEGRAM_ID,
]);

/** True if `telegramId` is a system account (house or bankroll). */
export function isSystemAccount(telegramId: number): boolean {
  return RESERVED_SYSTEM_IDS.has(telegramId);
}
