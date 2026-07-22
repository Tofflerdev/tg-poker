import React from 'react';
import { Socket } from 'socket.io-client';
import { useTelegram } from '../hooks/useTelegram';
import type { TelegramUser, ExtendedClientEvents, ExtendedServerEvents } from '../../../types/index';
import { ConsentBanner } from '../components/ConsentBanner';
import { Card } from '../components/ui';
import { avatarUrl, type AvatarId } from '../assets/avatars/manifest';
import logoUrl from '../assets/logo.svg';

/**
 * MainMenu — Neon Strip redesign (Plan 02-04).
 *
 * Layout (top→bottom, mobile-first):
 *   1. NightRiver logo header (Plan 02-03 asset)
 *   2. Four Card blocks in locked order (D-16):
 *        Deposit → Tables → Daily Bonus → Profile
 *   3. Footer legal links (ToS · Privacy · Responsible Gaming)
 *
 * Avatar rendering uses `avatarUrl(currentUser.avatarId)` via the Plan 02-02
 * manifest resolver. Telegram `photo_url` / legacy `avatarUrl` is NOT rendered
 * (D-15). Initial-letter fallback fires when avatarId is missing (D-14).
 *
 * All block styling routes through `<Card variant>` from `../components/ui`;
 * no inline NEON literal maps remain here.
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

// Avatar sub-component with initial-letter fallback (D-14, D-15).
const MenuAvatar: React.FC<{ user: TelegramUser }> = ({ user }) => {
  const src = avatarUrl(user.avatarId as AvatarId | undefined);
  const initial = (user.displayName || user.firstName || '?').trim().charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={user.displayName || user.firstName}
        style={{
          width: 48,
          height: 48,
          borderRadius: 999,
          objectFit: 'cover',
          border: '1.5px solid color-mix(in srgb, var(--color-active) 55%, transparent)',
          boxShadow: '0 0 10px var(--glow-call)',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: 48,
        height: 48,
        borderRadius: 999,
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in srgb, var(--color-active) 12%, transparent)',
        border: '1.5px solid color-mix(in srgb, var(--color-active) 55%, transparent)',
        color: 'var(--color-active)',
        boxShadow: '0 0 10px var(--glow-call)',
        fontSize: 20,
        fontWeight: 700,
        flexShrink: 0,
        textShadow: '0 0 6px var(--glow-call)',
      }}
    >
      {initial}
    </div>
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
    className={onClick ? 'active:scale-[0.98]' : undefined}
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
  right?: React.ReactNode;
  left?: React.ReactNode;
}> = ({ title, subtitle, titleColor, right, left }) => (
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
          fontSize: 16,
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
  const balanceFormatted = user ? user.balance.toLocaleString() : '—';

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
      {/* ─── Header: NightRiver logo ─────────────────────────── */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px 0 14px',
        }}
      >
        <img
          src={logoUrl}
          alt="NightRiver"
          style={{ height: 40, width: 'auto', maxWidth: '100%' }}
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

      {/* ─── Block 1: Deposit (first-position per D-16 / DEPOSIT-01) ─ */}
      <BlockCard
        variant="raise"
        onClick={nav('deposit', 'medium')}
        ariaLabel="Deposit — add chips"
      >
        <BlockRow
          title="Deposit"
          subtitle="Add chips with USDT"
          titleColor="var(--color-action-raise)"
          left={
            <div
              aria-hidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                border: '1.5px solid color-mix(in srgb, var(--color-action-raise) 50%, transparent)',
                background: 'color-mix(in srgb, var(--color-action-raise) 10%, transparent)',
                color: 'var(--color-action-raise)',
                fontSize: 22,
                flexShrink: 0,
                textShadow: '0 0 8px var(--glow-raise)',
              }}
            >
              💰
            </div>
          }
          right={<ChevronRight color="var(--color-action-raise)" />}
        />
      </BlockCard>

      {/* ─── Block 2: Tables ─────────────────────────────────── */}
      <BlockCard
        variant="call"
        onClick={nav('tables', 'medium')}
        ariaLabel="Play Now — browse tables"
      >
        <BlockRow
          title="Play Now"
          subtitle="Browse tables and join a seat"
          titleColor="var(--color-action-call)"
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

      {/* ─── Block 3: Profile ────────────────────────────────── */}
      <BlockCard
        variant="active"
        onClick={nav('profile', 'light')}
        ariaLabel="Profile and settings"
      >
        {user ? (
          <BlockRow
            title={displayName}
            subtitle={`${balanceFormatted} chips`}
            titleColor="var(--color-active)"
            left={<MenuAvatar user={user} />}
            right={<ChevronRight color="var(--color-active)" />}
          />
        ) : (
          <BlockRow
            title="Profile"
            subtitle="Settings and stats"
            titleColor="var(--color-active)"
            right={<ChevronRight color="var(--color-active)" />}
          />
        )}
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
