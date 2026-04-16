/*
  Vite-hashed URL map for the 20 avatar WebPs.

  IMPORTANT: each entry below MUST be a literal `new URL('./{slug}.webp',
  import.meta.url).href` expression. Vite's asset pipeline only hashes URLs
  when it can statically analyse the string argument — template literals or
  loops defeat this (RESEARCH Pitfall 2). Keep the list explicit.

  Adding / removing a slug:
    1. Update `types/avatars.ts` AVATARS const.
    2. Add/delete the matching `.webp` in this directory.
    3. Add/remove the entry in URLS below.
*/

import { AVATARS, type AvatarId } from '../../../../types/avatars';

const URLS: Record<AvatarId, string> = {
  fox:       new URL('./fox.webp',       import.meta.url).href,
  wolf:      new URL('./wolf.webp',      import.meta.url).href,
  bear:      new URL('./bear.webp',      import.meta.url).href,
  tiger:     new URL('./tiger.webp',     import.meta.url).href,
  panda:     new URL('./panda.webp',     import.meta.url).href,
  raccoon:   new URL('./raccoon.webp',   import.meta.url).href,
  lion:      new URL('./lion.webp',      import.meta.url).href,
  rabbit:    new URL('./rabbit.webp',    import.meta.url).href,
  owl:       new URL('./owl.webp',       import.meta.url).href,
  eagle:     new URL('./eagle.webp',     import.meta.url).href,
  flamingo:  new URL('./flamingo.webp',  import.meta.url).href,
  penguin:   new URL('./penguin.webp',   import.meta.url).href,
  crocodile: new URL('./crocodile.webp', import.meta.url).href,
  chameleon: new URL('./chameleon.webp', import.meta.url).href,
  cobra:     new URL('./cobra.webp',     import.meta.url).href,
  shark:     new URL('./shark.webp',     import.meta.url).href,
  octopus:   new URL('./octopus.webp',   import.meta.url).href,
  dolphin:   new URL('./dolphin.webp',   import.meta.url).href,
  frog:      new URL('./frog.webp',      import.meta.url).href,
  bat:       new URL('./bat.webp',       import.meta.url).href,
};

export { AVATARS, type AvatarId };

/**
 * Resolve the hashed asset URL for an avatar id.
 * Returns undefined for null/undefined/unknown ids so the SeatsDisplay
 * Avatar component can fall back to the initial-letter render (D-14).
 */
export function avatarUrl(id: AvatarId | null | undefined): string | undefined {
  if (id == null) return undefined;
  return URLS[id as AvatarId];
}
