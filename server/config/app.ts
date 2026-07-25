/**
 * App-level identity config — the things that change between the test bot and
 * the production one, so they must never be hard-coded.
 *
 * Currently: where to send a player back to after they pay a Crypto Pay invoice.
 */

/**
 * Public link to the Telegram bot / mini app, used as the "back to the app"
 * button on a paid invoice.
 *
 * Two ways to set it, most specific first:
 *   MINI_APP_URL  — a full link, when the plain bot link is not enough
 *                   (e.g. https://t.me/MyBot/app?startapp=deposit).
 *   BOT_USERNAME  — just the username ("Testpoke_bot" or "@Testpoke_bot"),
 *                   from which https://t.me/<username> is built.
 *
 * Returns null when neither is configured — callers then omit the button
 * entirely rather than emitting a broken link.
 */
export function getMiniAppUrl(): string | null {
  const explicit = (process.env.MINI_APP_URL ?? '').trim();
  if (explicit !== '') return explicit;

  const username = (process.env.BOT_USERNAME ?? '').trim().replace(/^@/, '');
  if (username === '') return null;
  return `https://t.me/${username}`;
}
