# Playtest bots

In-process bots so the owner can play vs bots, accumulate human-vs-bot hands,
and get per-session improvement reports. Bots are server-side `Player`s in
`Game.seats[]` (no socket); the admin panel spawns them.

See `plans/bot-playtest-plan.md` for the full design and decisions.

## Pipeline

```
admin Add Bots ──▶ BotDriver acts on bot turns ──▶ SessionRecorder (JSONL)
                                                          │
                                                          ▼
                                          oracle (assertions) + sessionStats
                                                          │
                                                          ▼
                                     generateReport → reports/report-<ts>.md
                                                          │
                                                          ▼
                                       Reviewer (Claude) qualitative pass
```

## Files

- `handStrength.ts` / `decideAction.ts` — tight-passive bot decision (pure).
- `BotDriver.ts` — schedules + applies bot actions on bot turns (wired via
  `updateTableState` in `server/index.ts`).
- `botRegistry.ts` — reserved negative-id bot identities.
- `SessionRecorder.ts` — appends actions + hand results to `sessions/*.jsonl`
  (gated by `RECORD_SESSIONS`).
- `oracle.ts` / `runOracle.ts` — replay JSONL, verify correctness invariants.
- `sessionStats.ts` / `reportBuilder.ts` / `generateReport.ts` — objective
  balance/stability metrics + Reviewer report scaffold.

## Running a playtest

1. **Migrate once** (adds `users.is_bot`): `docker-compose up -d && npx prisma db push`.
2. Start the server with recording on: `RECORD_SESSIONS=1 npm run dev`.
3. Open the Mini App, sit at a table.
4. In the admin panel (`/admin`), on that table's row: pick a count and **Add Bots**.
   - **Remove Bots** drops them; bots auto-clean when the last human leaves.
   - **Bots: self-play** toggles bot-only grinding (off by default — decision B).
5. Play. Every action + hand result is appended to `sessions/session-<ts>.jsonl`.

## Producing a report

```bash
npm run build
node dist/server/bot/runOracle.js     sessions/session-<ts>.jsonl   # quick assertions, exit 2 on findings
node dist/server/bot/generateReport.js sessions/session-<ts>.jsonl   # writes reports/report-<ts>.md
```

## Reviewer (Claude) pass

`generateReport` fills the **objective** parts of the report:

- **Rules correctness** — every oracle finding (chip conservation, pot accounting,
  side-pot eligibility, independent winner recompute). These are bugs.
- **Balance / gameplay** — showdown/all-in/side-pot rates, action mix, per-player
  net / VPIP / all-ins.
- **Stability** — log parse errors (crashes/timeouts come from server logs).

Then hand the report **plus** the JSONL and the engine code to Claude to complete
the **Reviewer notes** section: interpret outliers, tie each recommendation to a
specific hand id or metric, and prioritise rules > balance > stability.

> Caveat: `chipConservation` can false-positive when a player leaves mid-hand
> (their seat drops from `perPlayer` while their committed chips stay in the pot).
> Weigh findings against the table's leave activity.
