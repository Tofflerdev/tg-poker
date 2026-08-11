import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';
import { LEGAL_UPDATED, LEGAL_VERSION } from './legalMeta';

/**
 * Responsible Gaming — Plan 02-08 / D-30 / COMPLIANCE-05.
 *
 * v2.0 rewrite. The original D-30 content list (virtual-chip disclaimer, "not
 * for real money", daily-bonus economy) described the play-money app and is
 * SUPERSEDED — every one of those statements became false when the app moved to
 * Crypto Pay deposits and payouts. What carries over from D-30 is the shape:
 * informational copy, no forced lockouts, no session-duration tracking, no timer,
 * no age-verification UI. Required content now:
 *   1. Real-money risk stated plainly, including the rake's long-run effect.
 *   2. Practical guidance for keeping play in bounds.
 *   3. Honest account of which limits exist and what they are actually for.
 *   4. Explicit list of what we do NOT enforce automatically.
 *   5. Self-exclusion on request — implemented manually via the admin ban path,
 *      so this is a promise the product can actually keep.
 *   6. Warning signs and where to get outside help.
 */

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
            Version {LEGAL_VERSION} — NightRiver
            <br />
            Last updated: {LEGAL_UPDATED}
          </Meta>

          {/* 1 — real-money risk, stated first and without softening */}
          <Callout>
            You are playing for real money and you can lose it. Every chip on your
            balance is worth $0.01, and a losing session takes real value out of your
            pocket, not a scoreboard.
          </Callout>

          <Section title="Know the Maths">
            Poker is a game of skill, but it is played against other people who are
            also trying to win, and we take a 5% fee from played-out pots. That fee
            comes out of the money at the table. Over a long enough run, the average
            player loses — winning consistently takes real study and discipline, and
            most people who assume they are above average are not.
            <br />
            <br />
            Treat what you deposit as the price of playing, not as capital you expect
            to grow. Poker is not income, and it is not a way out of a shortfall.
          </Section>

          <Section title="Keep It in Bounds">
            <Bullets
              items={[
                'Decide what a session costs you before you sit down, and deposit only that. Money you need for anything else does not belong here.',
                'Set a stop — an amount or a time — and leave when you hit it, whether you are up or down.',
                'Do not chase losses. Moving up in stakes to win back a bad session is the single most expensive habit in poker.',
                'Do not play tired, angry, or after drinking. Tilt costs more than any single bad beat.',
                'Take the money out. Withdrawing a win makes it real; leaving it on the table means it is still in play.',
                'Play the stakes your balance supports, not the biggest one you can afford to sit at.',
              ]}
            />
          </Section>

          {/* 3 — what the limits actually are, without dressing them up */}
          <Section title="What the App Limits">
            <Bullets
              items={[
                'You can sit out or leave a table between hands at any time, and your chips return to your balance.',
                'Your balance is shown in dollars as well as chips, so the cost of a session stays visible.',
                'Table stakes: you can never lose more in a hand than the chips you brought to the table.',
                'Payouts are capped at $500 per 24 hours. This is a fraud-prevention control, not a spending protection — it limits how fast money leaves, not how much you can put in or lose.',
              ]}
            />
          </Section>

          {/* 4 — the absence of automatic protection, said plainly */}
          <Section title="What We Do Not Enforce">
            We do not impose deposit limits, loss limits, session timers, or
            automatic cool-off periods, and we do not track how long you play. There
            is nothing in the app that will stop you before you have lost more than
            you meant to. Setting those boundaries is yours to do, and the guidance
            above is the whole of what the app offers on its own.
          </Section>

          {/* 5 — self-exclusion: manual, but real */}
          <Section title="Taking a Break — Ask Us">
            If you want to stop and would rather not rely on willpower, ask support
            through the Telegram bot that launched this Mini App and we will lock
            your account for the period you name, or permanently. Two things to know:
            <Bullets
              items={[
                'Withdraw your balance first — a locked account cannot play, and we would rather return your money before the lock than argue about it after.',
                'We will not lift a lock early, however you ask. That is the point of it.',
              ]}
            />
          </Section>

          <Section title="Warning Signs">
            Be honest with yourself if any of these are true:
            <Bullets
              items={[
                'You are playing with money set aside for something else, or with borrowed money.',
                'You are depositing again straight after losing, to get even.',
                'You hide how much you play, or how much you have lost, from people close to you.',
                'You play to escape stress or low mood rather than because you want to.',
                'You have tried to cut down and could not.',
                'Losses affect your sleep, your work, or your relationships.',
              ]}
            />
            Any one of these is a reason to stop and take a long break. Several of
            them together are a reason to get help.
          </Section>

          <Section title="Where to Get Help">
            Free, confidential support for gambling problems exists in most
            countries, and it is worth using early rather than late:
            <Bullets
              items={[
                'Gamblers Anonymous — gamblersanonymous.org — peer support groups worldwide.',
                'GamCare — gamcare.org.uk — free advice and counselling, with a live chat service.',
                'BeGambleAware — begambleaware.org — self-assessment tools and a directory of local services.',
              ]}
            />
            If you are in immediate distress, contact a local health service or crisis
            line. Talking to someone you trust — a friend, a partner, a doctor — is a
            first step that costs nothing.
          </Section>

          <Section title="Keep It Away From Minors">
            NightRiver is for adults, 18 and over. The app opens through your
            Telegram account: anyone with access to your device and to Telegram can
            play with your money. Lock your device, and do not let anyone under 18
            use the app.
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

const Callout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      margin: '0 0 20px',
      padding: '12px 14px',
      borderRadius: 10,
      color: '#e0f7fa',
      fontSize: 14,
      background: 'color-mix(in srgb, var(--color-action-fold) 8%, transparent)',
      border: '1.5px solid color-mix(in srgb, var(--color-action-fold) 45%, transparent)',
    }}
  >
    {children}
  </div>
);

const Bullets: React.FC<{ items: string[] }> = ({ items }) => (
  <ul style={{ margin: '10px 0 10px', paddingLeft: 18, listStyle: 'none' }}>
    {items.map((text) => (
      <li key={text} style={{ position: 'relative', marginBottom: 7 }}>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: -14,
            color: 'var(--color-active)',
            textShadow: '0 0 6px var(--glow-call)',
          }}
        >
          ›
        </span>
        {text}
      </li>
    ))}
  </ul>
);
