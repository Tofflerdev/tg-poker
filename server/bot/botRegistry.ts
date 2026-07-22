import { generateRandomName } from '../utils/nameGenerator.js';
import { randomAvatarId } from '../../types/avatars.js';
import { RESERVED_SYSTEM_IDS } from '../payments/systemAccounts.js';

/**
 * Playtest bot identity.
 *
 * Bots use a reserved NEGATIVE telegramId range so they never collide with real
 * Telegram users and are trivially filterable (`telegramId < 0` / `isBot`).
 * Identities are derived from currently-seated bots rather than a persistent
 * counter: `acquireBotIdentity` hands out the lowest-magnitude negative id that
 * isn't seated anywhere, so ids (and their DB rows) are reused across spawns and
 * the pool stays bounded. Removing a bot frees its id automatically.
 */
export interface BotIdentity {
  telegramId: number; // negative
  displayName: string;
  avatarId: string;
}

/**
 * Pick a free bot identity given the set of telegramId strings currently seated
 * as bots. Pure (seated set is injected) so it's easy to unit test and so the
 * caller controls when the seated set is re-read between successive seats.
 */
export function acquireBotIdentity(seatedBotIds: Set<string>): BotIdentity {
  let id = -1;
  // Skip ids already seated, and never hand out a reserved system id (§K bankroll
  // lives in the negative range) — a bot must never seat under the bankroll wallet.
  while (seatedBotIds.has(String(id)) || RESERVED_SYSTEM_IDS.has(id)) id -= 1;
  return {
    telegramId: id,
    displayName: generateRandomName(),
    avatarId: randomAvatarId(),
  };
}
