# Phase 2: Design System Rollout & Avatars - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 02-design-system-rollout-avatars
**Areas discussed:** Branding + ui/ primitives, Avatar system, Page redesigns (4 pages + Deposit)
**Areas skipped:** Consent & compliance (defaults applied — see CONTEXT.md Claude's Discretion)

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Branding + ui/ primitives | BRAND-01/02, UI-05 — name, logo, shared primitives | ✓ |
| Avatar system | AVATAR-01..04 — sourcing, picker, assign | ✓ |
| Consent & compliance | COMPLIANCE-01/02/03/05 — flow, banner, copy | |
| Page redesigns | UI-01..04 + DEPOSIT + PROFILE-01 | ✓ |

---

## Branding + ui/ primitives

### Q1: BRAND-01 final project name

| Option | Description | Selected |
|--------|-------------|----------|
| Decide name now | Propose a final name this session | |
| Keep NightRiver for v1.0 | Adopt NightRiver as the real name | ✓ |
| Placeholder with rename hook | Centralize brand name in one constant | |

### Q2: BRAND-02 logo asset

| Option | Description | Selected |
|--------|-------------|----------|
| AI-generated now | Generate SVG/PNG in-session | ✓ |
| Wordmark only | Neon Strip wordmark of project name | |
| Placeholder, supply later | Wire slot with neutral placeholder | |

### Q3: UI-05 primitive build strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Build all 4 upfront | Dedicated plan creates Button/Card/Tab/Badge | ✓ |
| Extract as we redesign | Extract patterns as they emerge | |
| Minimal set + grow | Ship Button+Card, add others on demand | |

### Q4: Primitive variant API

| Option | Description | Selected |
|--------|-------------|----------|
| Action-tier variants | fold/call/raise/allin/sit/neutral/active | ✓ |
| Semantic + size | primary/secondary/danger/ghost × sm/md/lg | |
| Hybrid | Semantic for generic + ActionButton for in-game | |

**Notes:** Action-tier includes `neutral` and `active` which cover generic "Accept"/"Cancel"/"Back" buttons — no need for a separate generic variant set.

---

## Avatar system

### Q1: AVATAR-01 art production

| Option | Description | Selected |
|--------|-------------|----------|
| AI-generated in-session | 20 WebP assets with consistent prompt | ✓ |
| You supply the assets | User produces externally | |
| Placeholders + replace later | Simple generated placeholders; real art later | |

### Q2: Species list selection

| Option | Description | Selected |
|--------|-------------|----------|
| You pick the 20 | User provides list | |
| Claude proposes, you approve | Claude drafts balanced list, user approves | ✓ |
| Defer species selection | Lock count + contract; list in follow-up | |

### Q3: AVATAR-03 picker UX

| Option | Description | Selected |
|--------|-------------|----------|
| Grid on Profile/Avatar tab | 4×5 grid, tap-to-select, confirm button | ✓ |
| Grid with live preview | Grid + large preview at top | |
| Horizontal carousel | Full-width carousel | |

### Q4: AVATAR-02 atomic assign

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side on user create | Pick inside INSERT transaction | ✓ |
| UPDATE WHERE avatarId IS NULL | Insert then conditional update | |
| You decide | Claude picks after reading code | |

---

## Page redesigns (4 pages + Deposit)

### Q1: UI-01 + DEPOSIT-01 Main Menu order

| Option | Description | Selected |
|--------|-------------|----------|
| Deposit / Bonus / Tables / Profile | Deposit first, bonus second | |
| Deposit / Tables / Bonus / Profile | Deposit first, Tables second (primary action close) | ✓ |
| Hero layout | Deposit hero card + 2-col grid | |

### Q2: UI-02 Table List treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Card per table (stake-tier tint) | Large cards, tier-tinted glow | |
| Grouped by tier | Section headers per tier, dense rows | ✓ |
| You decide | Claude picks after running frontend-design | |

### Q3: UI-03 + PROFILE-01 Profile tabs

| Option | Description | Selected |
|--------|-------------|----------|
| 3 tabs: Profile / Avatar / History | History as Phase 3 stub | ✓ |
| 2 tabs: Profile / Avatar | No History in Phase 2 | |
| Single scrolling page | No tabs | |

### Q4: UI-04 Game Room top labels

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing — cleaner chrome | Remove labels outright | ✓ |
| Minimal dot + name | Small tier dot + name top-left | |
| Slim top strip | Unified thin top strip | |

---

## Claude's Discretion (applied to skipped area)

- Consent gate flow (single full-page route, combined accept checkbox, dismissible grandfather banner)
- ToS / Privacy / RG copy drafts (English v1.0, user reviews)
- Tier color for "High Stakes" (orange vs red — pick on readability)
- AI prompt wording for logo + 20 avatars
- Whether `ui/` primitives barrel through an `index.ts`

## Deferred Ideas

- Rename brand beyond NightRiver — v1.1+ if marketing needs
- Server-side `joinTable` ToS enforcement → Phase 5
- Hand history tab content → Phase 3
- Avatar unlocks / streak rewards → v1.1+
