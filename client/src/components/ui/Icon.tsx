import React from 'react';
import { VARIANT_TIER, type ActionTier } from './tokens';

/**
 * Icon — Neon Strip pictogram primitive.
 *
 * Replaces the emoji/glyph literals that used to sit inline in JSX (🐣, ✅, ♠, ✎, …).
 * Emoji rendered differently on every platform and ignored the Neon Strip palette
 * entirely; these are generated artworks shipped from `client/public/icons/`.
 *
 * Colour comes from the design system, not the PNG. Each asset is an ALPHA MASK
 * (white RGB, alpha = the artwork), applied via `mask-image` over a token-coloured
 * background — so an icon always matches the tier it sits in, and no hex literal
 * enters this file (same rule as Card/Button/Badge, see ./tokens.ts).
 *
 * Assets are rebuilt from the generator output by `scripts/build-icons.ps1`:
 * 256×256, trimmed to the artwork bbox and normalised so every icon's long side
 * fills the same share of the box. Without that pass the icons drift in optical
 * size relative to each other.
 *
 * `glow` adds the neon bloom via `drop-shadow` — the generated art is deliberately
 * flat line-work so the glow stays a theme concern rather than being baked in.
 */

export type IconName =
  // Table tiers — TableList row badges, keyed off blinds (see tierOf/ICON_FOR_TIER)
  | 'tier-funnel'
  | 'tier-beginner'
  | 'tier-standard'
  | 'tier-pro'
  | 'tier-highstakes'
  // User-facing
  | 'deposit-success'
  | 'history-empty'
  | 'edit-pencil'
  | 'chat-luck'
  | 'play-cards'
  // Admin
  | 'admin-ok'
  | 'admin-warn'
  | 'admin-flag';

export interface IconProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  name: IconName;
  /** Rendered box in px (square). */
  size?: number;
  variant?: ActionTier;
  glow?: boolean;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 16,
  variant = 'neutral',
  glow,
  style,
  ...rest
}) => {
  const t = VARIANT_TIER[variant];
  const mask = `url(/icons/${name}.png) center / contain no-repeat`;
  return (
    <span
      aria-hidden
      {...rest}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flexShrink: 0,
        backgroundColor: t.color,
        mask,
        WebkitMask: mask,
        filter: glow ? `drop-shadow(0 0 ${Math.round(size / 3)}px ${t.glow})` : undefined,
        ...style,
      }}
    />
  );
};
