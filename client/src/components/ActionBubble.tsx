import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { PlayerActionKind } from '../../../types/index';
import { VARIANT_TIER, type ActionTier } from './ui/tokens';

/**
 * Phase 3 / Plan 03-03 — single animated bubble pill.
 *
 * D-05: pop-scale + fade enter (120 ms easeOut), opacity + 6 px y-drift exit (200 ms easeIn).
 * D-06: prefers-reduced-motion → instant in/out (duration 0), HOLD unchanged at 900 ms (managed by parent).
 * D-07: action-tier color from VARIANT_TIER; uses CSS vars only (no hex literals).
 * UI-SPEC label table: FOLD / CHECK / CALL N / BET N / RAISE TO N / ALL-IN [N].
 */

export interface ActionBubbleProps {
  action: PlayerActionKind;
  amount: number;
}

/** Map PlayerActionKind → ActionTier per 03-UI-SPEC.md. */
function actionToTier(action: PlayerActionKind): ActionTier {
  switch (action) {
    case 'fold': return 'fold';
    case 'check':
    case 'call': return 'call';
    case 'bet':
    case 'raise': return 'raise';
    case 'allin': return 'allin';
  }
}

/** Build the exact label per UI-SPEC label-copy table. */
export function bubbleLabel(action: PlayerActionKind, amount: number): string {
  switch (action) {
    case 'fold': return 'FOLD';
    case 'check': return 'CHECK';
    case 'call': return `CALL ${amount}`;
    case 'bet': return `BET ${amount}`;
    case 'raise': return `RAISE TO ${amount}`;
    case 'allin': return amount > 0 ? `ALL-IN ${amount}` : 'ALL-IN';
  }
}

export const ActionBubble: React.FC<ActionBubbleProps> = ({ action, amount }) => {
  // RESEARCH §"Risks/Gotchas" #5: useReducedMotion may return null on first
  // render (jsdom + SSR-like behavior). Treat null as false (animate by default).
  const reducedMotion = useReducedMotion() ?? false;
  const tier = actionToTier(action);
  const t = VARIANT_TIER[tier];

  // D-05 vs D-06 variants. Hold duration is enforced by the parent layer.
  const initial = reducedMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0 };
  const animate = reducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 };
  const exit = reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 };
  const transition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.12, ease: 'easeOut' as const };

  return (
    <motion.span
      role="status"
      data-action={action}
      data-tier={tier}
      initial={initial}
      animate={animate}
      exit={exit}
      transition={transition}
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: t.color,
        background: 'rgba(10,10,14,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1.5px solid color-mix(in srgb, ${t.color} 50%, transparent)`,
        boxShadow: `0 0 8px ${t.glow}, inset 0 0 4px ${t.glow}`,
        textShadow: `0 0 6px ${t.glow}`,
        // motion overrides transform during animation; pointer-events handled by parent layer.
      }}
    >
      {bubbleLabel(action, amount)}
    </motion.span>
  );
};
