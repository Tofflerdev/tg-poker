import React from 'react';
import { Socket } from 'socket.io-client';
import { useTelegram } from '../hooks/useTelegram';
import type { TelegramUser, ExtendedClientEvents, ExtendedServerEvents } from '../../../types/index';
import { ConsentBanner } from '../components/ConsentBanner';
import { Card } from '../components/ui';
import { avatarUrl, type AvatarId } from '../assets/avatars/manifest';
import logoUrl from '../assets/logo.svg';

/**
 * MainMenu — Neon Strip, "player badge" layout.
 *
 * Layout (top→bottom, mobile-first):
 *   1. NightRiver wordmark, small and centered — the player is already inside
 *      the app, so the logo is a marker, not the hero.
 *   2. Identity hero: 96px avatar + name, the whole block is the entry to
 *      Profile. The standalone Profile card is gone — the avatar replaces it.
 *   3. Balance at display scale (monospace amber, the same treatment
 *      SeatsDisplay gives stacks at the table).
 *   4. Deposit / Withdraw as two equal neon buttons directly under the
 *      balance — money and the actions on it read as one unit.
 *   5. Play Now card.
 *   6. Footer legal links (ToS · Privacy · Responsible Gaming)
 *
 * Only the arrangement changed from the Plan 02-04 four-card stack; every
 * color, radius, border and glow still comes from the Neon Strip tokens via
 * `<Card variant>` / `VARIANT_TIER`.
 *
 * Avatar rendering uses `avatarUrl(currentUser.avatarId)` via the Plan 02-02
 * manifest resolver. Telegram `photo_url` / legacy `avatarUrl` is NOT rendered
 * (D-15). Initial-letter fallback fires when avatarId is missing (D-14).
 *
 * AppView navigation uses a single `onNavigate(view)` prop going forward so
 * Plan 02-08 can extend with `consent` / `legal-*` variants without reshaping
 * the API (planner recommendation).
 */

// AppView mirror — kept permissive to allow Plan 02-08 additions (`legal-*`,
// `consent`) without breaking this component's prop contract. App.tsx narrows
// to the exact union it supports in this milestone.
export type AppNavigateTarget =
  | 'menu'
  | 'tables'
  | 'game'
  | 'profile'
  | 'deposit'
  | 'withdraw'
  | 'legal-tos'
  | 'legal-privacy'
  | 'legal-rg'
  | 'consent';

interface MainMenuProps {
  user: TelegramUser | null;
  onNavigate: (view: AppNavigateTarget) => void;
  // Plan 02-08: socket is required by ConsentBanner for the grandfather flow.
  // Only the consent-related events are used from this socket here; all other
  // MainMenu interactions stay on App.tsx's shared socket via onNavigate.
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  // Plan 02-08: App.tsx informs MainMenu whether the grandfather banner should
  // be considered for display. The banner itself owns the localStorage
  // dismissal flag; we hoist the "user hasn't accepted" predicate up to App.tsx
  // so the banner stays dumb.
  showGrandfatherBanner: boolean;
  // Plan 02-08: banner Accept / banner "Read terms" use the same App.tsx
  // tosAccepted listener as the full-page Consent route — we just forward
  // the onAccept callback upward so App.tsx can update currentUser.
  onTosAccepted: () => void;
}

// Tap feedback + keyboard focus ring. Inline styles can't express :active /
// :focus-visible, so the interactive states live in one injected sheet —
// same pattern SeatsDisplay uses for its keyframes.
const MENU_CSS = `
.nr-tap {
  -webkit-tap-highlight-color: transparent;
  transition: transform .1s;
}
.nr-tap:active { transform: scale(0.97); }
.nr-tap:focus-visible {
  outline: 2px solid var(--color-active);
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
  .nr-tap { transition: none; }
  .nr-tap:active { transform: none; }
}
`;

// Avatar sub-component with initial-letter fallback (D-14, D-15).
// `size` drives every dimension so the 96px hero and any future compact use
// share one recipe.
const MenuAvatar: React.FC<{ user: TelegramUser | null; size: number }> = ({ user, size }) => {
  const src = avatarUrl(user?.avatarId as AvatarId | undefined);
  const initial = (user?.displayName || user?.firstName || '?').trim().charAt(0).toUpperCase();
  const ring = {
    width: size,
    height: size,
    borderRadius: 999,
    border: '2px solid color-mix(in srgb, var(--color-active) 55%, transparent)',
    boxShadow: `0 0 ${Math.round(size / 4.5)}px var(--glow-call)`,
    flexShrink: 0,
  } satisfies React.CSSProperties;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ ...ring, objectFit: 'cover', display: 'block' }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        ...ring,
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in srgb, var(--color-active) 12%, transparent)',
        color: 'var(--color-active)',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        textShadow: '0 0 6px var(--glow-call)',
      }}
    >
      {initial}
    </div>
  );
};

// Thousands groups separated by a 0.22em gap instead of a full monospace
// space — at display size a real space splits the figure into two numbers.
// The readable value is exposed once, on the balance block's aria-label.
const GroupedDigits: React.FC<{ value: number }> = ({ value }) => (
  <>
    {value
      .toLocaleString('en-US')
      .split(',')
      .map((group, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ display: 'inline-block', width: '0.22em' }} />}
          {group}
        </React.Fragment>
      ))}
  </>
);

// Deposit / Withdraw: bare neon rectangles, no Card wrapper — the same
// transparent-with-inner-glow recipe as the GameControls action buttons.
const MoneyButton: React.FC<{
  tier: 'raise' | 'call';
  glyph: string;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}> = ({ tier, glyph, label, ariaLabel, onClick }) => {
  const color = tier === 'raise' ? 'var(--color-action-raise)' : 'var(--color-action-call)';
  const glow = tier === 'raise' ? 'var(--glow-raise)' : 'var(--glow-call)';
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="nr-tap"
      style={{
        height: 64,
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        background: 'transparent',
        border: `1.5px solid color-mix(in srgb, ${color} 55%, transparent)`,
        boxShadow: `inset 0 0 12px ${glow}`,
        color,
        textShadow: `0 0 8px ${glow}`,
        fontSize: 13.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>
        {glyph}
      </span>
      {label}
    </button>
  );
};

// Interactive Card wrapper — makes a Card behave like a button with an
// accent GlowBar at its bottom edge (matches the GameControls GlowBar
// vocabulary). No dedicated primitive yet; kept inline so MainMenu owns
// its tap-target recipe without adding a new ui/ entry.
const BlockCard: React.FC<{
  variant: 'raise' | 'call' | 'sit' | 'active';
  onClick?: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}> = ({ variant, onClick, children, ariaLabel }) => (
  <div
    role={onClick ? 'button' : undefined}
    aria-label={ariaLabel}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    className={onClick ? 'nr-tap' : undefined}
    style={{
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform .1s',
      WebkitTapHighlightColor: 'transparent',
    }}
  >
    <Card variant={variant} glow padding={14} style={{ position: 'relative', minHeight: 72 }}>
      {children}
      {/* GlowBar accent at bottom edge (Neon Strip convention) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 6,
          height: 2,
          borderRadius: 2,
          background: `var(${
            variant === 'raise'
              ? '--color-action-raise'
              : variant === 'call'
              ? '--color-action-call'
              : variant === 'sit'
              ? '--color-action-sit'
              : '--color-active'
          })`,
          opacity: 0.55,
          boxShadow: `0 0 6px var(${
            variant === 'raise'
              ? '--glow-raise'
              : variant === 'call'
              ? '--glow-call'
              : variant === 'sit'
              ? '--glow-sit'
              : '--glow-call'
          })`,
        }}
      />
    </Card>
  </div>
);

const BlockRow: React.FC<{
  title: string;
  subtitle?: string;
  titleColor: string;
  titleSize?: number;
  right?: React.ReactNode;
  left?: React.ReactNode;
}> = ({ title, subtitle, titleColor, titleSize = 16, right, left }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
    }}
  >
    {left}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          color: titleColor,
          fontSize: titleSize,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textShadow: `0 0 8px ${titleColor}`,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            marginTop: 3,
            color: 'var(--color-neutral)',
            fontSize: 12,
            letterSpacing: '0.02em',
            opacity: 0.8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
    {right}
  </div>
);

const ChevronRight: React.FC<{ color: string }> = ({ color }) => (
  <span
    aria-hidden
    style={{
      color,
      fontSize: 22,
      lineHeight: 1,
      opacity: 0.7,
      textShadow: `0 0 6px ${color}`,
      flexShrink: 0,
    }}
  >
    ›
  </span>
);

export const MainMenu: React.FC<MainMenuProps> = ({
  user,
  onNavigate,
  socket,
  showGrandfatherBanner,
  onTosAccepted,
}) => {
  const { hideMainButton, setHeaderColor, hapticFeedback } = useTelegram();

  React.useEffect(() => {
    // Plan 02-03: Telegram chrome follows Neon Strip dark surface (--color-surface-base).
    // Hex literal required — setHeaderColor takes a string, not a CSS var.
    setHeaderColor('#0a0a0e');
    hideMainButton();
    return () => {
      hideMainButton();
    };
  }, [hideMainButton, setHeaderColor]);

  const nav = (target: AppNavigateTarget, haptic: 'medium' | 'light' = 'medium') => () => {
    hapticFeedback?.impactOccurred(haptic);
    onNavigate(target);
  };

  const displayName = user?.displayName || user?.firstName || 'Player';

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, rgba(0,229,255,0.06) 0%, transparent 55%), #0a0a0e',
        padding: 'max(env(safe-area-inset-top), 16px) 16px max(env(safe-area-inset-bottom), 16px) 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        color: '#e0f7fa',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <style>{MENU_CSS}</style>

      {/* ─── Header: NightRiver wordmark, deliberately small ──── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '2px 0 0',
        }}
      >
        <img
          src={logoUrl}
          alt="NightRiver"
          style={{ height: 30, width: 'auto', maxWidth: '100%', opacity: 0.85 }}
        />
      </header>

      {/* ─── Grandfather banner (Plan 02-08 / D-29 / COMPLIANCE-03) ──
          Non-blocking, dismissible. Rendered iff App.tsx determined the
          user has no tosAcceptedAt. Banner owns its own localStorage
          dismissal flag — this conditional is just the "should we ever
          consider showing it?" gate. */}
      {showGrandfatherBanner && (
        <ConsentBanner
          socket={socket}
          onAccept={onTosAccepted}
          onViewLegal={(which) =>
            onNavigate(
              which === 'tos'
                ? 'legal-tos'
                : which === 'privacy'
                ? 'legal-privacy'
                : 'legal-rg'
            )
          }
        />
      )}

      {/* ─── Identity hero: avatar + name, the entry to Profile ─
          Replaces the standalone Profile card — the avatar is the link. */}
      <button
        type="button"
        aria-label="Profile and settings"
        onClick={nav('profile', 'light')}
        className="nr-tap"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '4px 0 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'inherit',
          width: '100%',
        }}
      >
        <MenuAvatar user={user} size={96} />
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#e0f7fa',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayName}
        </span>
        <span
          aria-hidden
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: '0.1em',
            color: 'var(--color-neutral)',
            opacity: 0.7,
          }}
        >
          Profile and stats ›
        </span>
      </button>

      {/* ─── Balance: the largest object on the screen ────────── */}
      <div
        role="group"
        aria-label={user ? `Balance ${user.balance.toLocaleString('en-US')} chips` : 'Balance unavailable'}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '2px 0 4px',
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 58,
            lineHeight: 1,
            letterSpacing: '-0.01em',
            color: 'var(--color-chip)',
            textShadow: '0 0 14px var(--glow-raise)',
          }}
        >
          {user ? <GroupedDigits value={user.balance} /> : '—'}
        </span>
        <span
          aria-hidden
          style={{
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-chip)',
            opacity: 0.6,
          }}
        >
          chips
        </span>
      </div>

      {/* ─── Money actions: equal weight, directly under the sum ─ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <MoneyButton
          tier="raise"
          glyph="＋"
          label="Deposit"
          ariaLabel="Deposit — add chips"
          onClick={nav('deposit', 'medium')}
        />
        <MoneyButton
          tier="call"
          glyph="↑"
          label="Withdraw"
          ariaLabel="Withdraw — cash out chips"
          onClick={nav('withdraw', 'medium')}
        />
      </div>

      {/* ─── Tables ──────────────────────────────────────────── */}
      <BlockCard
        variant="call"
        onClick={nav('tables', 'medium')}
        ariaLabel="Play Now — browse tables"
      >
        <BlockRow
          title="Play Now"
          subtitle="Browse tables and join a seat"
          titleColor="var(--color-action-call)"
          titleSize={18}
          left={
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                border: '1.5px solid color-mix(in srgb, var(--color-action-call) 50%, transparent)',
                background: 'color-mix(in srgb, var(--color-action-call) 10%, transparent)',
                color: 'var(--color-action-call)',
                fontSize: 22,
                flexShrink: 0,
                textShadow: '0 0 8px var(--glow-call)',
              }}
            >
              🃏
            </div>
          }
          right={<ChevronRight color="var(--color-action-call)" />}
        />
      </BlockCard>

      {/* Spacer to push footer down when there's vertical room */}
      <div style={{ flex: 1, minHeight: 8 }} />

      {/* ─── Footer: legal links (handlers wired in Plan 02-08) ─ */}
      <footer
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          paddingTop: 12,
          borderTop: '1px solid color-mix(in srgb, var(--color-neutral) 20%, transparent)',
          fontSize: 11,
          letterSpacing: '0.03em',
          color: 'var(--color-neutral)',
          opacity: 0.75,
        }}
      >
        {/*
          Plan 02-08 wire-up: footer links dispatch onNavigate() with the
          AppView variants that 02-08 adds to App.tsx. MainMenu's
          AppNavigateTarget union already permissively allows these values
          (pre-declared in Plan 02-04 for 02-08's extension).
        */}
        <button
          type="button"
          onClick={() => onNavigate('legal-tos')}
          style={linkButtonStyle}
        >
          Terms
        </button>
        <span aria-hidden style={{ opacity: 0.4 }}>·</span>
        <button
          type="button"
          onClick={() => onNavigate('legal-privacy')}
          style={linkButtonStyle}
        >
          Privacy
        </button>
        <span aria-hidden style={{ opacity: 0.4 }}>·</span>
        <button
          type="button"
          onClick={() => onNavigate('legal-rg')}
          style={linkButtonStyle}
        >
          Responsible Gaming
        </button>
      </footer>
    </div>
  );
};

const linkButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  letterSpacing: 'inherit',
  padding: '6px 2px',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  textDecoration: 'underline',
  textDecorationColor: 'color-mix(in srgb, var(--color-neutral) 40%, transparent)',
  textUnderlineOffset: 3,
};
