# Phase 1: Foundations & Design System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 01-foundations-design-system
**Areas discussed:** Neon Strip token shape, telegramId refactor strategy, Game callback contract, Prisma migration shape

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Neon Strip token shape | CSS vars/Tailwind/TS shape, naming, migration of NEON literals | ✓ |
| telegramId refactor strategy | Big-bang vs adapter; map home; eviction scope | ✓ |
| Game callback contract | Signatures, payloads, sync/async | ✓ |
| Prisma migration shape | HandHistory/AuditLog schema, packaging, indexes | ✓ |
| Auth fail-closed behavior | (Pinned by SECURITY-01/02/03; handled inline in CONTEXT) | — |

---

## Neon Strip token shape

| Option | Description | Selected |
|--------|-------------|----------|
| CSS vars + Tailwind @theme | Single source of truth, runtime-themable | ✓ |
| TS token object only | Inline-style only, no Tailwind utilities | |
| Tailwind theme only | No CSS vars; non-Tailwind code can't read tokens | |

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic action-tier | --color-action-fold, --color-action-call, etc. | ✓ |
| Descriptive color names | --neon-red, --neon-cyan, etc. | |
| Both layers | Descriptive primitives + semantic aliases | |

| Option | Description | Selected |
|--------|-------------|----------|
| Refactor NEON literals in this phase | Prove tokens end-to-end before Phase 2 | ✓ |
| Leave for Phase 2 | Smaller blast radius this phase | |
| Keep NEON object as re-export | Zero-touch for callers | |

---

## telegramId refactor strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Big-bang refactor | Replace socketId keys with telegramId everywhere | ✓ |
| Incremental adapter | Keep socketId-keyed; add resolver | |
| Big-bang + socketId on Player for transport | (Effectively how the chosen big-bang lands) | |

| Option | Description | Selected |
|--------|-------------|----------|
| TableManager owns the map | Colocated with Players | ✓ |
| userStorage owns it | Cleaner separation, reach-into cost | |
| New SessionRegistry module | Useful for Phase 4 sessionToken | |

| Option | Description | Selected |
|--------|-------------|----------|
| Scaffold eviction now, no replacedBySession yet | Hook exists; event lands Phase 4 | ✓ |
| Defer entirely to Phase 4 | Phase 1 only does the keying refactor | |
| Full eviction + event now | Risks Phase 4 scope creep | |

---

## Game callback contract

| Option | Description | Selected |
|--------|-------------|----------|
| Two setter methods | setOnPlayerAction / setOnHandComplete | ✓ |
| EventEmitter | game.on('playerAction', cb) | |
| Single onEvent dispatcher | Discriminated-union types | |

| Option | Description | Selected |
|--------|-------------|----------|
| Raw + derived bubble fields | Includes potAfter, totalBetThisStreet | ✓ |
| Raw only | Server/client computes display | |
| Pre-formatted bubble payload | Couples Game.ts to UI copy | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-player results array | Drives HandHistory + chip checkpoint in one event | ✓ |
| Minimal: chip deltas only | Phase 3 re-collects details | |
| Full hand transcript | Heaviest payload | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sync fire-and-forget | Listener queues async work | ✓ |
| Async awaited | Risks blocking hand loop | |

---

## Prisma migration shape

| Option | Description | Selected |
|--------|-------------|----------|
| HandHistory per-player rows | Trivial 'last 50 hands' query | ✓ |
| One row per hand + JSON players | Slower per-user queries | |
| Two tables: Hand + HandPlayer | Normalized; two writes | |

| Option | Description | Selected |
|--------|-------------|----------|
| AuditLog typed core + JSON before/after | Filterable + flexible diffs | ✓ |
| Fully typed columns per action | Schema bloat | |
| Single payload JSON blob | Simplest, sacrifices queryability | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single v1_mvp_launch migration | Atomic; matches RESILIENCE-01 | ✓ |
| Split per concern | Finer rollback, deviates naming | |

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted query indexes | (telegramId, playedAt DESC), retention, audit, currentTableId | ✓ |
| Defaults only | Add later if slow | |

---

## Claude's Discretion

- File names/paths within the chosen contracts.
- Internal helpers/types as needed.
- Whether the telegramId↔socket map is a direct field on TableManager or a small same-module helper.

## Deferred Ideas

- replacedBySession event + GameState snapshot → Phase 4
- PII scrubbing in Sentry/logs → Phase 5
- HandHistory writer + 90-day retention job → Phase 3
- AdminAuditLog writer + admin namespace → Phase 5
- Avatar bundling, atomic random-assign, re-pick → Phase 2
- ToS gate on joinTable → Phase 5
