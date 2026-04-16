import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';

/**
 * Responsible Gaming — Plan 02-08 / D-30 / COMPLIANCE-05.
 *
 * REQUIRED CONTENT per D-30 / COMPLIANCE-05 (DO NOT remove):
 *   1. Virtual-chip disclaimer.
 *   2. Explicit "not for real money" statement.
 *   3. Daily-bonus-only economy description.
 *   4. Informational "take a break" guidance.
 *   5. Explicit absence of forced lockouts, session timers, session tracking.
 *
 * NO forced lockouts, NO session-duration tracking, NO age verification UI,
 * NO timer. Pure informational copy, Neon Strip styled.
 */

/* DRAFT v1.0 — user to review before production launch */

interface LegalPageProps {
  onBack: () => void;
}

export const ResponsibleGaming: React.FC<LegalPageProps> = ({ onBack }) => {
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
          Responsible Gaming
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

          {/* Content item #1 — Virtual-chip disclaimer (D-30 required) */}
          <Section title="Virtual Chips Only">
            All chips, balances, and bonuses in NightRiver are virtual and
            have no monetary value. They cannot be exchanged for cash, goods,
            or other consideration.
          </Section>

          {/* Content item #2 — "Not for real money" (D-30 required) */}
          <Section title="Not for Real Money">
            NightRiver is a free play-money poker app. There is no deposit,
            no withdrawal, and no gambling for real money or prizes.
          </Section>

          {/* Content item #3 — Daily-bonus-only economy (D-30 required) */}
          <Section title="How Chips Work">
            Your chip balance refills to 1,000 once every 24 hours when it
            falls below that amount. There is no other way to acquire chips.
          </Section>

          {/* Content item #4 — Informational "take a break" (D-30 required) */}
          <Section title="Take a Break">
            Even play-money poker rewards focus and discipline. If a session
            is making you tense, frustrated, or causing you to neglect
            responsibilities, step away. Healthy play looks like: short
            sessions, clear stop times, and time spent away from the table.
          </Section>

          {/* Content item #5 — Explicit absence of lockouts (D-30 required) */}
          <Section title="What We Do Not Enforce">
            We do not enforce session-duration limits, deposit limits, or
            self-exclusion at this time. The guidance above is informational.
            Caring for how you play is your responsibility, and we trust you
            to set your own boundaries.
          </Section>

          <Section title="If You Need Support">
            If you or someone you know feels that gameplay — even with
            virtual chips — has become a source of distress, please consider
            reaching out to a trusted friend, family member, or a professional
            counsellor. Taking a long break from the app is always an option.
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
