import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';

/**
 * Terms of Service — Plan 02-08 / D-26 / COMPLIANCE-01.
 *
 * Static legal copy, Neon Strip styled, reachable from:
 *   - Main Menu footer ("Terms")
 *   - Profile / Settings legal links (future — Plan 02-06 owns the Profile page;
 *     footer wire-up in MainMenu is done here alongside routing changes in App.tsx).
 *   - Inline link on Consent page.
 *
 * The component is pure: no socket, no data fetch. Reachable from any consent
 * or non-consent context — back button returns to wherever the caller chose
 * (Consent for unaccepted users, MainMenu otherwise — decided by App.tsx).
 */

/* DRAFT v1.0 — user to review before production launch */

interface LegalPageProps {
  onBack: () => void;
}

export const ToS: React.FC<LegalPageProps> = ({ onBack }) => {
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
      {/* Top bar: Back + title */}
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
          Terms of Service
        </div>
        <div style={{ flex: '0 0 auto', width: 72 }} aria-hidden />
      </div>

      {/* Scrollable body */}
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

          <Section title="1. Acceptance of Terms">
            By using NightRiver, you agree to these Terms of Service. If you do
            not accept them, please do not use the app. We may update these
            Terms from time to time; continued use after changes constitutes
            acceptance of the updated Terms.
          </Section>

          <Section title="2. Eligibility">
            NightRiver is intended for users 18 years of age or older. By using
            the app you represent that you meet this age requirement and that
            you are legally permitted to use a play-money poker app in your
            jurisdiction.
          </Section>

          <Section title="3. Virtual Chips Only">
            All chips, balances, and bonuses in NightRiver are <em>virtual</em>
            {' '}and have no monetary value. They cannot be purchased, sold,
            exchanged for cash, goods, or any other consideration. NightRiver
            is not a gambling service.
          </Section>

          <Section title="4. Account & Conduct">
            You are responsible for activity that occurs under your Telegram
            account. Cheating, collusion, use of bots or automated tools,
            creating multiple accounts to gain an advantage, and any attempt
            to exploit the app or harass other players are prohibited and may
            result in suspension or termination.
          </Section>

          <Section title="5. Daily Bonus">
            A Daily Bonus sets your chip balance to 1,000 when your balance
            falls below that amount and at least 24 hours have elapsed since
            your last Daily Bonus claim. The Daily Bonus is the only means of
            acquiring chips.
          </Section>

          <Section title="6. Termination">
            We may suspend or terminate your access to NightRiver at our
            discretion, including but not limited to violations of these
            Terms. Chips and stats associated with a terminated account may
            be forfeited.
          </Section>

          <Section title="7. Limitation of Liability">
            NightRiver is provided "as is" without warranties of any kind.
            To the maximum extent permitted by law, we disclaim liability for
            any indirect, incidental, or consequential damages arising from
            your use of the app.
          </Section>

          <Section title="8. Changes to Terms">
            We may update these Terms. When material changes are made, we may
            re-present this page and ask you to accept the updated Terms
            before continuing to play.
          </Section>

          <Section title="9. Contact">
            Questions about these Terms can be directed to NightRiver support
            via the Telegram bot that launched this Mini App.
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
