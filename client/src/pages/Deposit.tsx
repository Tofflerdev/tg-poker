import React from 'react';
import { Button, Card } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import logoUrl from '../assets/logo.svg';

/**
 * Deposit — "Coming soon" stub page (Plan 02-04, D-17, DEPOSIT-02).
 *
 * Strictly informational:
 *   - No external links
 *   - No payment SDK imports
 *   - No email capture / "notify me" form
 *   - No Telegram deep links
 *
 * Plan 02-08 adds the defense-in-depth consent gate; this page does NOT
 * guard on `tosAcceptedAt` yet (RESEARCH Pitfall 4).
 */

interface DepositProps {
  onBack: () => void;
}

export const Deposit: React.FC<DepositProps> = ({ onBack }) => {
  const { setHeaderColor, hapticFeedback } = useTelegram();

  React.useEffect(() => {
    setHeaderColor('#0a0a0e');
  }, [setHeaderColor]);

  const handleBack = () => {
    hapticFeedback?.impactOccurred('light');
    onBack();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, rgba(0,229,255,0.07) 0%, transparent 55%), #0a0a0e',
        padding:
          'max(env(safe-area-inset-top), 12px) 16px max(env(safe-area-inset-bottom), 16px) 16px',
        color: '#e0f7fa',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      {/* ─── Top bar: back button + logo ─────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 0 20px',
        }}
      >
        <Button
          variant="neutral"
          onClick={handleBack}
          aria-label="Back to menu"
          style={{
            minHeight: 40,
            padding: '0 12px',
            fontSize: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
          <span>Back</span>
        </Button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <img
            src={logoUrl}
            alt="NightRiver"
            style={{ height: 28, width: 'auto', opacity: 0.9 }}
          />
        </div>
        {/* Phantom spacer so the logo stays optically centered */}
        <div style={{ width: 72, flexShrink: 0 }} aria-hidden />
      </header>

      {/* ─── Center stage ────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 0',
        }}
      >
        <Card
          variant="active"
          glow
          padding={28}
          style={{
            width: '100%',
            maxWidth: 360,
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Decorative chip icon */}
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              margin: '0 auto 20px',
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              border: '2px solid color-mix(in srgb, var(--color-action-raise) 55%, transparent)',
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--color-action-raise) 18%, transparent) 0%, color-mix(in srgb, var(--color-action-raise) 4%, transparent) 70%)',
              boxShadow:
                '0 0 24px var(--glow-raise), inset 0 0 16px color-mix(in srgb, var(--color-action-raise) 30%, transparent)',
              fontSize: 36,
              color: 'var(--color-action-raise)',
              textShadow: '0 0 12px var(--glow-raise)',
            }}
          >
            💰
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--color-active)',
              textShadow: '0 0 14px var(--glow-call)',
              lineHeight: 1.15,
            }}
          >
            Coming Soon
          </h1>

          <div
            aria-hidden
            style={{
              width: 72,
              height: 2,
              margin: '14px auto 18px',
              background: 'var(--color-active)',
              boxShadow: '0 0 8px var(--glow-call)',
              opacity: 0.7,
              borderRadius: 2,
            }}
          />

          <p
            style={{
              margin: 0,
              color: '#c9d8de',
              fontSize: 14,
              lineHeight: 1.55,
              letterSpacing: '0.015em',
            }}
          >
            Real-money deposits are not yet available.
          </p>
          <p
            style={{
              margin: '10px 0 0',
              color: 'var(--color-neutral)',
              fontSize: 13,
              lineHeight: 1.55,
              opacity: 0.85,
            }}
          >
            Play with virtual chips and claim your daily bonus.
          </p>
        </Card>
      </main>

      {/* ─── Bottom filler keeps card optically centered on tall screens ── */}
      <div style={{ height: 24 }} aria-hidden />
    </div>
  );
};
