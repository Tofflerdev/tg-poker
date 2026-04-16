import React from 'react';
import { VARIANT_TIER, type ActionTier } from './tokens';

/**
 * Badge — Neon Strip pill status indicator primitive.
 *
 * Phase 2 / Plan 02-01 (D-04, D-05, D-06):
 * - Variant prop is the closed ActionTier union. No freeform color props.
 * - Pill shape (borderRadius 999), low-alpha tinted background, 50%-alpha
 *   colored border, small tier-colored text with a textShadow glow.
 * - Extracted from the StatusBadge recipe in SeatsDisplay.tsx (lines 96-117)
 *   and parameterized on ActionTier.
 * - Used by Plan 05 (tier badges) and Plan 07 (status pills).
 */

export interface BadgeProps {
  variant: ActionTier;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ variant, children }) => {
  const t = VARIANT_TIER[variant];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: t.color,
        background: `color-mix(in srgb, ${t.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${t.color} 50%, transparent)`,
        textShadow: `0 0 6px ${t.glow}`,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
};
