---
phase: 02-design-system-rollout-avatars
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/components/ui/tokens.ts
  - client/src/components/ui/Button.tsx
  - client/src/components/ui/Card.tsx
  - client/src/components/ui/Tab.tsx
  - client/src/components/ui/Badge.tsx
  - client/src/components/ui/index.ts
  - client/src/styles/neon.css
autonomous: true
requirements: [UI-05, BRAND-03]
must_haves:
  truths:
    - "Four primitives (Button, Card, Tab, Badge) exist under client/src/components/ui/ and consume Neon Strip tokens via var(--…) — no hex literals"
    - "Variant API is action-tier-only: 'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral'"
    - "client build (cd client && npm run build) succeeds with primitives in tree (even if not yet imported)"
    - "VARIANT_TIER lookup in tokens.ts is the single source for variant→token mapping"
  artifacts:
    - path: "client/src/components/ui/tokens.ts"
      provides: "ActionTier type + VARIANT_TIER lookup"
      exports: ["ActionTier", "VARIANT_TIER"]
    - path: "client/src/components/ui/Button.tsx"
      provides: "Action-tier Button primitive with optional emphasis + fullWidth"
      exports: ["Button"]
    - path: "client/src/components/ui/Card.tsx"
      provides: "Dark translucent panel with backdrop-blur, optional variant border + glow"
      exports: ["Card"]
    - path: "client/src/components/ui/Tab.tsx"
      provides: "Underline tab with bottom GlowBar; active tab uses --color-active"
      exports: ["Tab", "TabBar"]
    - path: "client/src/components/ui/Badge.tsx"
      provides: "Pill badge with low-alpha background, colored border, text-shadow glow"
      exports: ["Badge"]
    - path: "client/src/components/ui/index.ts"
      provides: "Barrel re-export of all four primitives + ActionTier type"
  key_links:
    - from: "client/src/components/ui/Button.tsx"
      to: "client/src/components/ui/tokens.ts"
      via: "import { VARIANT_TIER, type ActionTier }"
      pattern: "from '\\./tokens'"
    - from: "client/src/components/ui/tokens.ts"
      to: "client/src/styles/neon.css"
      via: "var(--color-action-*) / var(--glow-*) references"
      pattern: "var\\(--color-action-"
---

<objective>
Build the four shared `ui/` primitives (Button, Card, Tab, Badge) that every Phase 2 page redesign consumes from day one (D-04). Variant API is action-tier-only per D-05 — no freeform color props. Primitives consume CSS custom properties from `client/src/styles/neon.css` (Phase 1 substrate), with no inline hex literals (D-06).

Purpose: Page redesigns in subsequent plans cannot start until these primitives exist. They encode the Neon Strip vocabulary (color, border, glow, shadow) once so consumers stay declarative.

Output: A `client/src/components/ui/` directory with 5 files (4 primitives + tokens.ts) plus optional barrel `index.ts`. Build passes. No consumer changes yet — wiring happens in plans 03-08.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/02-design-system-rollout-avatars/02-CONTEXT.md
@.planning/phases/02-design-system-rollout-avatars/02-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/STRUCTURE.md
@client/src/styles/neon.css
@client/src/components/GameControls.tsx
@client/src/components/SeatsDisplay.tsx

<interfaces>
<!-- Existing Phase 1 token API in client/src/styles/neon.css -->
CSS custom properties available:
- --color-action-fold (#ff4757)
- --color-action-call (#00e5ff)
- --color-action-raise (#ffab00)
- --color-action-allin (#ff6d00)
- --color-action-sit (#4caf50)
- --color-active (#00e5ff)
- --color-chip (#ffab00)
- --color-neutral (#b0bec5)
- --glow-fold, --glow-call, --glow-raise, --glow-allin, --glow-sit, --glow-neutral

<!-- Reference implementation (extract patterns FROM here, do not modify yet) -->
GameControls.tsx neonBtn(n, active) — lines ~55-83: defines transparent bg, 1.5px border at 38% alpha, optional inset glow on active, 14px radius, uppercase letter-spacing.
SeatsDisplay.tsx Avatar component: dark rgba(10,10,14,0.88) bg + backdrop-blur(12px) + 1.5px border at 38% — Card recipe.
SeatsDisplay.tsx GlowBar — small bottom bar — Tab underline recipe.
SeatsDisplay.tsx StatusBadge ~lines 96-117 — pill with low-alpha bg + colored border + text-shadow — Badge recipe.

<!-- This plan's exported API (downstream plans consume it) -->
```typescript
// client/src/components/ui/tokens.ts
export type ActionTier = 'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral';
export const VARIANT_TIER: Record<ActionTier, { color: string; glow: string }>;

// client/src/components/ui/Button.tsx
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionTier;
  emphasis?: boolean;
  fullWidth?: boolean;
}
export const Button: React.FC<ButtonProps>;

// client/src/components/ui/Card.tsx
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ActionTier;   // default 'neutral'
  glow?: boolean;
  padding?: number | string;
}
export const Card: React.FC<CardProps>;

// client/src/components/ui/Tab.tsx
export interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
export interface TabBarProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}
export const Tab: React.FC<TabProps>;
export const TabBar: React.FC<TabBarProps>;

// client/src/components/ui/Badge.tsx
export interface BadgeProps {
  variant: ActionTier;
  children: React.ReactNode;
}
export const Badge: React.FC<BadgeProps>;
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Define tokens + ActionTier contract + (optional) surface-base token</name>
  <files>client/src/components/ui/tokens.ts, client/src/styles/neon.css</files>
  <action>
    Create `client/src/components/ui/tokens.ts`. Per D-05 export the closed `ActionTier` union `'fold' | 'call' | 'raise' | 'allin' | 'sit' | 'active' | 'neutral'` and a `VARIANT_TIER` record mapping each tier to `{ color, glow }` strings using `var(--color-action-*)` / `var(--color-active)` / `var(--color-neutral)` and `var(--glow-*)`. No hex literals. Mirror the mapping from RESEARCH §Pattern 1.

    In `client/src/styles/neon.css`, ADD a single new token `--color-surface-base: #0a0a0e` inside the existing `@theme` block (used later by Plan 04 for `setHeaderColor` replacement and by Card default background where needed). Do NOT touch any other tokens. Per Pitfall 7, reviewer should restart `cd client && npm run dev` after touching neon.css if running.

    Per D-05 / D-06: NO freeform color/colorClass props on any primitive (enforced via TS type) and NO inline hex literals anywhere in this plan's files.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>tokens.ts exports `ActionTier` and `VARIANT_TIER`; neon.css has new `--color-surface-base` token; build passes.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Implement Button + Card primitives</name>
  <files>client/src/components/ui/Button.tsx, client/src/components/ui/Card.tsx</files>
  <action>
    Implement `Button` per RESEARCH §Pattern 1: transparent (or low-alpha gradient when `emphasis=true`) background, `1.5px solid color-mix(in srgb, t.color 38%, transparent)` border, 14px radius, uppercase 0.03em letter-spacing, fontWeight 700, minHeight 44 (mobile tap target), `WebkitTapHighlightColor: transparent`, `transition: 'box-shadow .15s, background .15s, transform .1s'`. When `emphasis`, apply `boxShadow: 0 0 18px ${t.glow}, inset 0 0 12px ${t.glow}`. `:active` scale via inline className OR `style` is fine — match the existing GameControls press feedback (`active:scale-95` Tailwind class is acceptable). Forward all standard `<button>` props via `...rest` and merge `style`.

    Implement `Card` per RESEARCH §Example 1: `background: 'rgba(10,10,14,0.88)'` (or `var(--color-surface-base)` with alpha if reviewer prefers), `backdropFilter: blur(12px)` + WebKit prefix, `1.5px solid color-mix(...)` border keyed off variant (default `neutral`), `borderRadius: 14`, `padding: 16` (overridable via `padding` prop), optional `boxShadow: 0 0 18px ${t.glow}` when `glow=true`. Forward ...rest and merge style.

    Both primitives must reference VARIANT_TIER from `./tokens`. NO hex literals in either file.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>Button.tsx and Card.tsx exported with the prop shapes from `<interfaces>`; build passes; grep for hex literals (`#[0-9a-fA-F]{3,6}`) inside both files returns 0 matches except `rgba(10,10,14,…)` which is allowed (project precedent).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Implement Tab + TabBar + Badge primitives + barrel index</name>
  <files>client/src/components/ui/Tab.tsx, client/src/components/ui/Badge.tsx, client/src/components/ui/index.ts</files>
  <action>
    Implement `Tab` and `TabBar` per RESEARCH §Q2: underline-style. `TabBar` renders a flex row of `Tab` buttons with bottom border `1px solid color-mix(in srgb, var(--color-neutral) 18%, transparent)`. Each `Tab` shows label; active tab has color `var(--color-active)`, inactive has color `var(--color-neutral)`; active tab has a 2px tall bottom GlowBar `var(--color-active)` with `boxShadow: 0 0 8px var(--glow-call)` extending below the row. Inactive tabs are transparent. Tap target ≥44px height. Used by Plan 06 (Profile 3 tabs).

    Implement `Badge` per RESEARCH §Q2 (extracted from `StatusBadge` in SeatsDisplay): pill (`borderRadius: 999`), small text (10-11px), padding `2px 8px`, background `color-mix(in srgb, t.color 12%, transparent)`, border `1px solid color-mix(in srgb, t.color 50%, transparent)`, color `t.color`, `textShadow: 0 0 6px ${t.glow}`. Used by Plan 05 (tier badges) and Plan 07 (status pills).

    Create `client/src/components/ui/index.ts` re-exporting `Button`, `Card`, `Tab`, `TabBar`, `Badge`, `ActionTier`, `VARIANT_TIER`. Per D-06 / RESEARCH "Internal file layout — Claude's Discretion": barreled.
  </action>
  <verify>
    <automated>cd client && npm run build</automated>
  </verify>
  <done>Tab.tsx, Badge.tsx, index.ts exported per `<interfaces>`; build passes; `client/src/components/ui/` contains exactly 6 files (tokens.ts + 4 primitives + index.ts).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| n/a | This plan ships pure UI primitives with no I/O, no external input, no auth surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-02-01-01 | Tampering | Button/Card/Tab/Badge variant prop | mitigate | TS-level closed union `ActionTier` (D-05) — invalid variants fail at compile. Runtime fallback: `VARIANT_TIER[variant] ?? VARIANT_TIER.neutral` is acceptable but not required (TS already gates). |
| T-02-01-02 | Information disclosure | Card children rendering user content | accept | Children pass through React's auto-escaping; primitives never use `dangerouslySetInnerHTML`. No PII risk introduced. |
</threat_model>

<verification>
- All four primitive files exist and export the documented APIs.
- `cd client && npm run build` passes.
- No hex literal color values inside `client/src/components/ui/*.tsx` (the `rgba(10,10,14,…)` surface base is the only allowed exception, matching existing project precedent in SeatsDisplay/GameControls).
- New `--color-surface-base` token visible in compiled CSS from `npm run build`.
- No existing files (App.tsx, MainMenu.tsx, etc.) are modified — primitives are dormant until consumed by later plans.
</verification>

<success_criteria>
- `client/src/components/ui/` contains tokens.ts, Button.tsx, Card.tsx, Tab.tsx, Badge.tsx, index.ts.
- Closed `ActionTier` union enforced (no `color` / `colorClass` / `className`-overriding-color props leak through).
- Build green; no TS errors; no missing CSS var warnings.
- D-04, D-05, D-06 satisfied; UI-05 substrate ready for consumption.
</success_criteria>

<output>
After completion, create `.planning/phases/02-design-system-rollout-avatars/02-01-ui-primitives/02-01-SUMMARY.md` documenting: file list, exported API surface, any deviations from the prop shapes in `<interfaces>`, and a one-paragraph "how to consume" note for downstream plans.
</output>
