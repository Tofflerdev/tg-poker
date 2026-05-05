# Phase 3: Gameplay Additions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 03-gameplay-additions
**Areas discussed:** Action bubble behavior, Hand-history write pipeline, Privacy/retention/chip checkpoint
**Areas skipped (Claude's discretion):** Hand-history view UX (pagination, filters, row layout)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Action bubble behavior | Anchor, FIFO scope, motion, reduced-motion | ✓ |
| Hand-history write pipeline | Queue mechanism, batching, failure handling | ✓ |
| Hand-history view UX | Pagination, filters, row density, expand | |
| Privacy, retention & chip checkpoint | Hole-card privacy, 90d retention, checkpoint scope | ✓ |

---

## Action bubble behavior

### Q1: Where should the bubble anchor relative to the seat?

| Option | Description | Selected |
|--------|-------------|----------|
| Above avatar, offset outward | Floats above avatar, pushed toward table edge. Doesn't overlap hole cards. | ✓ |
| Over the stack/name strip | Covers chip count / name strip temporarily. Visible but hides info. | |
| Floating toward pot/center | Drifts toward pot center. Cinematic but harder to attribute with 6 bubbles. | |

**User's choice:** Above avatar, offset outward.
**Notes:** Uses existing SEAT_POSITIONS arrays; bottom "my seat" renders above the expanded mobile card.

### Q2: FIFO queueing scope when multiple players act in quick succession?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-seat queue, seats independent | Each seat has own queue. 5 fast folds render simultaneously. | ✓ |
| Global FIFO, serialized | One bubble at a time anywhere. 5 folds take ~5s. | |
| Per-seat + max 2 backlog | Per-seat independence with a drop policy beyond depth 2. | |

**User's choice:** Per-seat queue, seats independent.
**Notes:** Avoids the serialization drag. No queue-depth cap needed in Phase 3.

### Q3: Enter/exit transition style for bubbles?

| Option | Description | Selected |
|--------|-------------|----------|
| Pop-scale + fade | Scale 0.8→1.0 + fade-in (~120ms); fade + drift-up exit (~200ms). | ✓ |
| Slide from seat edge | Bubble slides outward from avatar edge, drifts up on exit. | |
| Pure fade, no scale | Simplest, most subdued. | |

**User's choice:** Pop-scale + fade. Fits Neon Strip glow/pulse vocabulary.

### Q4: Behavior when prefers-reduced-motion is set?

| Option | Description | Selected |
|--------|-------------|----------|
| Instant appear/disappear, keep min display | Snap in, hold 900ms, snap out. | ✓ |
| Disable bubbles entirely | No bubble renders. | |
| Instant appear + shorter display | Snap in, hold ~400ms, snap out. | |

**User's choice:** Instant appear/disappear, keep min display.
**Notes:** Bubbles carry gameplay-relevant info; disabling them entirely loses signal.

---

## Hand-history write pipeline

### Q1: Where does the write queue live?

| Option | Description | Selected |
|--------|-------------|----------|
| In-process memory queue | Array buffer in server/index.ts listener; timer flushes batch. | ✓ |
| Postgres-backed job table | Insert into jobs table, separate worker drains. | |
| Fire-and-forget per hand | prisma.handHistory.createMany().catch(log); no batching. | |

**User's choice:** In-process memory queue.
**Notes:** Simple, fast, no deps. Acceptable <1 batch loss on crash (not economic state).

### Q2: Batch size and flush cadence?

| Option | Description | Selected |
|--------|-------------|----------|
| Flush every 1s OR when buffer ≥ 50 rows | 1s keeps history near-real-time; 50-cap prevents huge transactions. | ✓ |
| Flush every 5s OR ≥ 200 rows | Larger batches, lower DB pressure, 5s visible lag on Profile. | |
| Flush after every onHandComplete (no batching delay) | Still async, one createMany per hand. | |

**User's choice:** Flush every 1s OR when buffer ≥ 50 rows.

### Q3: What happens when a batch flush fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Retry with backoff, drop after 3 attempts, log | 100ms → 500ms → 2s, then drop + log. Bounded memory. | ✓ |
| Retry forever, let queue grow | No loss guarantee but unbounded memory on DB outage. | |
| Drop immediately on first failure | Simplest, higher loss on transient hiccups. | |

**User's choice:** Retry with backoff, drop after 3 attempts, log.
**Notes:** Hand history is best-effort. Phase 5 Sentry will alert on drops.

### Q4: Chip checkpoint — same queue or separate synchronous path?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate synchronous write in onHandComplete | Different durability requirement. prisma.user.update awaited. | ✓ |
| Same batched queue as HandHistory | Simpler but loses economic state on crash between flush and next hand. | |
| Atomic transaction: chips + hand history together | Strongest consistency but couples two features. | |

**User's choice:** Separate synchronous write in onHandComplete.
**Notes:** Economic state must be durable before next hand; hand history is best-effort.

---

## Privacy, retention & chip checkpoint

### Q1: How is hole-card privacy enforced on HandHistory reads?

| Option | Description | Selected |
|--------|-------------|----------|
| Store always + filter at read time | Always persist holeCards; query filters based on requesting user + showedDown flag. | ✓ |
| Null out non-showdown cards at write time | Write holeCards=[] if !showedDown. Cheapest read, loses own folded-hand data forever. | |
| Separate tables: always for self, filtered for others | Two writes per hand per player. Over-engineered. | |

**User's choice:** Store always + filter at read time.
**Notes:** Preserves optionality for future self-replay feature without schema change.

### Q2: How does the 90-day retention job run?

| Option | Description | Selected |
|--------|-------------|----------|
| setInterval inside the server process | 24h timer from boot; fires immediately on boot. | ✓ |
| Boot-only sweep | Runs on restart. Long-running server never cleans up between restarts. | |
| External cron job / scheduled container | Cleaner separation but requires deploy infra (out of scope). | |

**User's choice:** setInterval inside the server process.

### Q3: Chip checkpoint scope — which players get written?

| Option | Description | Selected |
|--------|-------------|----------|
| All seated players at the table, every hand | Covers participants AND sit-out players. One rule. | ✓ |
| Only hand participants (folded/active at hand end) | Skip sit-outs. Phase 4 boot recovery would lose them. | |
| All seated + clear on buy-out / leave | Complete lifecycle. Pulls Phase 4 scope forward. | |

**User's choice:** All seated players at the table, every hand.

### Q4: Player-leaves-table flow — Phase 3 or Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 3 checkpoints on hand boundary only; leave path stays in Phase 4 | Clean phase boundary. Existing cashout untouched. | ✓ |
| Phase 3 also owns cashout checkpoint clear | Finishes lifecycle now. Pulls Phase 4 scope forward. | |

**User's choice:** Phase 3 checkpoints on hand boundary only; leave path stays in Phase 4.

---

## Claude's Discretion

- **Hand-history view UX** — user skipped this area. Defaults applied in CONTEXT.md:
  - Strict last-50, ordered playedAt DESC. No pagination in v1.0 (matches PROFILE-03 wording).
  - No filters (table/date/result) in v1.0 — deferred v1.1+.
  - Row: relative time + table name + net delta (green win / red loss) + final chips. Expand-on-tap for board + hole cards (privacy-filtered).
  - Socket event getHandHistory; server-side limit 50.
- Internal structure of per-seat bubble queues (Map vs array) within D-09 ActionBubbleLayer.
- Animation micro-tuning within D-05 bands.
- HandHistoryQueue.shutdown() graceful drain on SIGTERM (nice-to-have in Phase 3).
- Empty-state copy for Profile → History.

---

## Deferred Ideas (captured during discussion)

- Paginated / "load more" beyond 50 → v1.1+.
- Hand history filters (table/date/result) → v1.1+.
- Street-by-street replayer → v1.1+ (already in REQUIREMENTS future section).
- Postgres-backed durable job queue → future, only if support issue emerges.
- Sentry alert on dropped batches → Phase 5 (OBS-01).
- Cashout / kick / grace-expiry checkpoint clear + refund → Phase 4 (RESILIENCE-06/07).
- Per-action bubble timing tuning → future.

---

*Generated 2026-04-18*
