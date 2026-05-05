# Milestones — NightRiver (tg-poker)

---

## v1.0 — MVP Launch ✅ SHIPPED 2026-05-05

**Phases:** 1–6 | **Plans:** 38 | **Timeline:** 2026-04-14 → 2026-05-05 (21 days)
**LOC:** ~17,744 TypeScript/TSX | **Commits:** 221 | **Tests:** 204

### Delivered

Production-ready Neon Strip Telegram Mini App poker client — branded, fully redesigned, reconnect-safe, crash-safe, admin-controllable, and CI-gated test-covered.

### Key Accomplishments

1. **Full Neon Strip redesign** — all 4 pages rebuilt with shared `ui/` primitives; NightRiver brand (SVG logo + favicon + web manifest)
2. **20-animal avatar system** — random on signup, re-selectable in Profile, live-propagating to all seats; 20 WebP assets shipped
3. **Reconnect-safe sessions** — 30s/120s grace windows, full GameState snapshot on reconnect, crash recovery at server boot, atomic buy-in/cashout
4. **Hidden admin panel** — `/admin` Socket.io namespace, JWT auth, 4 live dashboards, 6 admin mutations, write-before-commit audit trail
5. **204-test Vitest + RTL suite** — per-element coverage for all 11 interactive components, 5 scenario flows, GitHub Actions CI gate
6. **Sentry + PostHog observability** with PII scrubbing; ToS/Privacy/RG compliance + server-side joinTable enforcement

### Known Gaps

- **BRAND-02 (partial):** Raster favicon.ico + logo-192.png not generated (no executor tooling); SVG ships; Telegram users unaffected.
- **BRAND-01 (partial):** "Bot handle references" = actual Telegram @BotName — external Telegram config, not code.

### Archive

- `.planning/milestones/v1.0-ROADMAP.md` — full phase details
- `.planning/milestones/v1.0-REQUIREMENTS.md` — all requirements with final status
