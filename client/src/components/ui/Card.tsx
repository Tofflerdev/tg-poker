import React from 'react';
import { VARIANT_TIER, type ActionTier } from './tokens';

/**
 * Card — Neon Strip dark translucent panel primitive.
 *
 * Phase 2 / Plan 02-01 (D-04, D-05, D-06):
 * - Dark translucent rgba(10,10,14,0.88) background + backdrop-blur(12px),
 *   matching SeatsDisplay Avatar surface recipe (project precedent).
 * - Variant keys the border tint; default `neutral`. Optional glow applies
 *   a color-matched outer box-shadow.
 * - padding override accepts number (px) or string (any CSS padding value).
 * - rgba(10,10,14,…) surface base is the only non-token color literal allowed
 *   per plan `<done>` criterion; every tier-colored value routes through
 *   VARIANT_TIER → CSS variables.
 */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: ActionTier;
  glow?: boolean;
  padding?: number | string;
}

export const Card: React.FC<CardProps> = ({
  variant = 'neutral',
  glow,
  padding = 16,
  style,
  children,
  ...rest
}) => {
  const t = VARIANT_TIER[variant];
  return (
    <div
      {...rest}
      style={{
        background: 'rgba(10,10,14,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1.5px solid color-mix(in srgb, ${t.color} 38%, transparent)`,
        borderRadius: 14,
        padding,
        boxShadow: glow ? `0 0 18px ${t.glow}` : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
