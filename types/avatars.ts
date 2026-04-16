/*
  Shared avatar identity — single source of truth for the 20-slug AvatarId enum.

  Consumers:
  - Server: `import { AVATARS, randomAvatarId } from '../../types/avatars.js';`
    (NodeNext requires the .js suffix — Pitfall 1 in 02-RESEARCH.md.)
  - Client: `import { AVATARS, randomAvatarId } from '../../../../types/avatars';`
    (Vite resolves without extension.)

  Pure module: no I/O, no fs, no imports (RESEARCH Q8 / Pitfall 1). Adding a
  new slug = append here + add matching .webp + extend manifest.ts URLS
  literal. Renaming a slug requires a DB backfill (D-10) — avoid.

  Order matches client/src/assets/avatars/README.md (locked 2026-04-16).
*/

export const AVATARS = [
  'fox',
  'wolf',
  'bear',
  'tiger',
  'panda',
  'raccoon',
  'lion',
  'rabbit',
  'owl',
  'eagle',
  'flamingo',
  'penguin',
  'crocodile',
  'chameleon',
  'cobra',
  'shark',
  'octopus',
  'dolphin',
  'frog',
  'bat',
] as const;

export type AvatarId = typeof AVATARS[number];

/**
 * Pick a random AvatarId. Used by UserRepository at user-create time to
 * atomically assign an avatar in the single INSERT (D-12).
 */
export function randomAvatarId(): AvatarId {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

/**
 * Type guard — returns true iff `id` is one of the 20 locked slugs.
 * Used by the server `updateAvatar` socket handler to reject tampered
 * payloads (T-02-02-02, ASVS V5 input validation).
 */
export function isValidAvatarId(id: unknown): id is AvatarId {
  return typeof id === 'string' && (AVATARS as readonly string[]).includes(id);
}
