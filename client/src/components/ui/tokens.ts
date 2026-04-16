/**
 * Neon Strip primitive tokens — single source of truth for variant→token mapping.
 *
 * Phase 2 / Plan 02-01 (D-04, D-05, D-06):
 * - Action-tier-only variant API. No freeform color props anywhere in ui/.
 * - All values reference CSS custom properties from client/src/styles/neon.css
 *   (Phase 1 substrate). No hex literals in this file or consumer primitives.
 */

export type ActionTier =
  | 'fold'
  | 'call'
  | 'raise'
  | 'allin'
  | 'sit'
  | 'active'
  | 'neutral';

export const VARIANT_TIER: Record<ActionTier, { color: string; glow: string }> = {
  fold:    { color: 'var(--color-action-fold)',  glow: 'var(--glow-fold)' },
  call:    { color: 'var(--color-action-call)',  glow: 'var(--glow-call)' },
  raise:   { color: 'var(--color-action-raise)', glow: 'var(--glow-raise)' },
  allin:   { color: 'var(--color-action-allin)', glow: 'var(--glow-allin)' },
  sit:     { color: 'var(--color-action-sit)',   glow: 'var(--glow-sit)' },
  active:  { color: 'var(--color-active)',       glow: 'var(--glow-call)' },
  neutral: { color: 'var(--color-neutral)',      glow: 'var(--glow-neutral)' },
};
