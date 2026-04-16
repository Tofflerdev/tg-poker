import React from 'react';
import { VARIANT_TIER, type ActionTier } from './tokens';

/**
 * Button — Neon Strip action-tier button primitive.
 *
 * Phase 2 / Plan 02-01 (D-04, D-05, D-06):
 * - Variant prop is the closed ActionTier union. No freeform color props.
 * - Transparent background by default; `emphasis` applies a low-alpha
 *   tinted gradient + inset glow (matches GameControls.tsx neonBtn `active`).
 * - All color / glow values come from CSS custom properties via VARIANT_TIER.
 * - 14px radius, 38% alpha border, uppercase 0.03em letter-spacing, 44px
 *   minHeight (mobile tap target), Tailwind `active:scale-95` press feedback.
 */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ActionTier;
  emphasis?: boolean;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant,
  emphasis,
  fullWidth,
  className,
  style,
  children,
  ...rest
}) => {
  const t = VARIANT_TIER[variant];
  return (
    <button
      {...rest}
      className={`active:scale-95${className ? ` ${className}` : ''}`}
      style={{
        background: emphasis
          ? `linear-gradient(180deg, color-mix(in srgb, ${t.color} 10%, transparent) 0%, color-mix(in srgb, ${t.color} 3%, transparent) 100%)`
          : 'transparent',
        border: `1.5px solid color-mix(in srgb, ${t.color} 38%, transparent)`,
        borderRadius: 14,
        color: t.color,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        minHeight: 44,
        width: fullWidth ? '100%' : undefined,
        boxShadow: emphasis
          ? `0 0 18px ${t.glow}, inset 0 0 12px ${t.glow}`
          : 'none',
        transition: 'box-shadow .15s, background .15s, transform .1s',
        WebkitTapHighlightColor: 'transparent',
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
};
