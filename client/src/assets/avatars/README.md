# Avatars

20 WebP avatars, slug-keyed, hashed by Vite via `manifest.ts`.

## Locked species list (D-09 gate, 2026-04-16)

The species list below is **locked** — these slugs are durable DB values
(AvatarId enum / `users.avatarId` column). Renaming a slug requires a DB
backfill migration, so entries are never edited in place. Adding a new slug
= append to `types/avatars.ts` `AVATARS` const + ship a new `.webp` + add an
entry to `manifest.ts` `URLS` literal (no DB migration needed, per D-10).
Removing a slug would orphan any user currently assigned to it — treat as
irreversible for v1.

Order below is the canonical order used by `AVATARS` in `types/avatars.ts`:

| # | Slug        | Class   |
|---|-------------|---------|
| 1 | fox         | mammal  |
| 2 | wolf        | mammal  |
| 3 | bear        | mammal  |
| 4 | tiger       | mammal  |
| 5 | panda       | mammal  |
| 6 | raccoon     | mammal  |
| 7 | lion        | mammal  |
| 8 | rabbit      | mammal  |
| 9 | owl         | bird    |
| 10| eagle       | bird    |
| 11| flamingo    | bird    |
| 12| penguin     | bird    |
| 13| crocodile   | reptile |
| 14| chameleon   | reptile |
| 15| cobra       | reptile |
| 16| shark       | aquatic |
| 17| octopus     | aquatic |
| 18| dolphin     | aquatic |
| 19| frog        | other   |
| 20| bat         | other   |

## AI prompt brief (LOCKED)

> **Style:** dark-background neon-rim portrait, anthropomorphic, head-and-shoulders,
> holding/playing poker (cards or chips visible).
> **Size:** 256×256 square.
> **Lighting:** cyan/amber neon rim lighting matching the Neon Strip palette.
> **Composition:** same camera distance, same lighting setup, same crop across all 20.
> **Background:** near-black or transparent.
> **Expression:** confident/playful, character-appropriate for the species.
> **Output:** WebP, quality ~80, target ≤15 KB per file, total ≤300 KB (per RESEARCH §Q3 budget).

## Adding / removing a slug

1. Update `types/avatars.ts` `AVATARS` const (keep the order stable — append only).
2. Add (or delete) the matching `.webp` in this directory.
3. Add (or remove) the corresponding entry in `manifest.ts` `URLS` literal.
   Use an explicit `new URL('./{slug}.webp', import.meta.url).href` literal per
   slug — Vite needs static string analysis, so no template strings or loops
   (RESEARCH Pitfall 2).
4. No Prisma migration is needed — the column is `String?`, slug values are
   validated at write time against `AVATARS` on the server (D-10).
