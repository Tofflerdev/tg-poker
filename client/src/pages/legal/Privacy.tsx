import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';

/**
 * Privacy Policy — Plan 02-08 / D-26 / COMPLIANCE-01.
 *
 * Static legal copy, Neon Strip styled. Pure component — no socket, no
 * data fetch. Structure matches ToS.tsx for visual consistency.
 */

/* DRAFT v1.0 — user to review before production launch */

interface LegalPageProps {
  onBack: () => void;
}

export const Privacy: React.FC<LegalPageProps> = ({ onBack }) => {
  const { showBackButton, hideBackButton } = useTelegram();

  useEffect(() => {
    showBackButton(onBack);
    return () => hideBackButton();
  }, [onBack, showBackButton, hideBackButton]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-base)',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px 10px',
          paddingTop: 'max(env(safe-area-inset-top), 14px)',
        }}
      >
        <div style={{ flex: '0 0 auto' }}>
          <Button
            variant="neutral"
            onClick={onBack}
            aria-label="Back"
            style={{ minHeight: 40, padding: '0 14px', fontSize: 12 }}
          >
            ← Back
          </Button>
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#fff',
          }}
        >
          Privacy Policy
        </div>
        <div style={{ flex: '0 0 auto', width: 72 }} aria-hidden />
      </div>

      <div
        style={{
          flex: 1,
          padding: '12px 12px 24px',
          paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
          overflowY: 'auto',
          maxWidth: 640,
          width: '100%',
          margin: '0 auto',
          lineHeight: 1.6,
        }}
      >
        <Card variant="neutral" padding={20}>
          <Meta>
            Version 1.0 — NightRiver
            <br />
            Last updated: April 2026 (DRAFT)
          </Meta>

          <Section title="1. What We Collect">
            To run the game, we record your Telegram ID, display name, and
            anonymous gameplay stats (hands played, hands won, total winnings,
            biggest pot). We do <em>not</em> collect your real name, payment
            information, email address, or any contact details beyond the
            Telegram account that launched the Mini App.
          </Section>

          <Section title="2. How We Use It">
            Collected data is used to: run the game (match you to a seat,
            track your chip balance, compute daily-bonus eligibility), prevent
            abuse (detect multi-accounting, cheating, and collusion), and
            produce aggregated, anonymous analytics about app usage.
          </Section>

          <Section title="3. Sharing">
            We do not sell your data. We may share aggregated, non-personally
            identifying analytics (for example, total active players on a
            given day) publicly. Personal data is not shared with third
            parties outside what is strictly necessary to operate the app.
          </Section>

          <Section title="4. Cookies &amp; Storage">
            NightRiver uses your browser's sessionStorage and localStorage to
            remember small pieces of game state (development-mode player ID,
            dismissed-banner preferences). These entries stay on your device
            and are not transmitted anywhere beyond what the app needs to
            function.
          </Section>

          <Section title="5. Data Retention">
            Your account data is retained for the lifetime of your account.
            Detailed hand history, when it ships in a future release, will be
            retained for 90 days per our operational policy; older hands are
            discarded.
          </Section>

          <Section title="6. Your Rights">
            You can request deletion of your NightRiver account and all
            associated data by contacting support via the Telegram bot that
            launched this Mini App. We will honor deletion requests within a
            reasonable time.
          </Section>

          <Section title="7. Contact">
            Questions about this Privacy Policy can be directed to NightRiver
            support via the Telegram bot that launched this Mini App.
          </Section>
        </Card>
      </div>
    </div>
  );
};

// ─── Local helpers ────────────────────────────────────────────────

const Meta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      color: 'var(--color-neutral)',
      fontSize: 11,
      letterSpacing: '0.04em',
      marginBottom: 20,
      textTransform: 'uppercase',
      opacity: 0.8,
    }}
  >
    {children}
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section style={{ marginBottom: 18 }}>
    <h2
      style={{
        color: 'var(--color-active)',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.04em',
        margin: '0 0 8px',
        textShadow: '0 0 6px var(--glow-call)',
      }}
    >
      {title}
    </h2>
    <div style={{ color: '#e0f7fa', fontSize: 14 }}>{children}</div>
  </section>
);
