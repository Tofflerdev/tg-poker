import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';
import { LEGAL_UPDATED, LEGAL_VERSION } from './legalMeta';

/**
 * Privacy Policy — Plan 02-08 / D-26 / COMPLIANCE-01.
 *
 * Static legal copy, Neon Strip styled. Pure component — no socket, no
 * data fetch. Structure matches ToS.tsx for visual consistency.
 *
 * v2.0 rewrite (real money). What is described here is mirrored from code:
 *   stored fields         prisma/schema.prisma (User, Transaction, HandHistory,
 *                         AdminAuditLog — note `telegramUsername` IS stored)
 *   hand-history 90 days  server/HandHistoryQueue.ts (RETENTION_DAYS)
 *   hashed analytics id   server/utils/analytics.ts (toAnalyticsId — sha256)
 *   error scrubbing       server/utils/scrubber.ts
 *   encrypted backups     scripts/ + plans/db-backup-plan.md (age → B2)
 * Chat is deliberately absent from the schema — it is broadcast, never stored.
 */

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
            Version {LEGAL_VERSION} — NightRiver
            <br />
            Last updated: {LEGAL_UPDATED}
          </Meta>

          <Section title="1. What We Collect">
            <Bullets
              items={[
                'Account: your numeric Telegram ID, your Telegram username if you have one, the display name you choose, and the avatar you pick. Your Telegram ID is what identifies you to us — we have no separate login.',
                'Money: every movement of chips is written to a ledger — deposits, withdrawals, buy-ins, cash-outs and rake, each with the amount, the time, the resulting balance, and the Crypto Pay invoice or transfer identifier it relates to.',
                'Hands: for each hand you are dealt into we record the table, your seat, your hole cards, the board, whether it reached showdown, and how many chips you won or lost.',
                'Profile stats: hands played, hands won, total winnings, biggest pot.',
                'Consent: when you accepted these documents and which version.',
                'Technical: server and web-server logs, which include your IP address, the time of a connection, and basic device and browser information.',
                'Support and moderation: what you write to support, and a record of administrative actions taken on your account.',
              ]}
            />
          </Section>

          <Section title="2. What We Never Collect">
            We never receive or store your wallet, private keys, seed phrase, card
            details, or any other payment credential — deposits and payouts happen
            inside Crypto Pay, and we only ever see that a payment of a given amount
            succeeded. We do not ask for identity documents, we do not collect your
            phone number or email address, and we do not track your location.
            <br />
            <br />
            One exception, and it is a narrow one: if we suspect fraud, or that an
            account is not being used by the person who owns it, we may ask you to
            confirm control of that Telegram account — never a passport, an address,
            or a photo of you.
          </Section>

          <Section title="3. Table Chat">
            Messages you send at a table are delivered to the players at that table
            and are not written to our database. They are not searchable, not kept
            after the session, and not used for anything else.
          </Section>

          <Section title="4. How We Use It">
            <Bullets
              items={[
                'To run the game: seat you, track your stack, settle pots, and keep your balance correct across reconnections.',
                'To process deposits and payouts, and to answer questions about a specific payment.',
                'To keep our books balanced: an automatic check reconciles the sum of all balances against the ledger and alerts us when it drifts.',
                'To review payouts and to detect collusion, chip dumping, and multiple accounts held by one person. Hand and ledger records are what make this possible.',
                'To find and fix faults, using error reports from the app and the server.',
                'To understand, in aggregate, how the app is used.',
              ]}
            />
          </Section>

          <Section title="5. Who Else Sees It">
            We do not sell your data, and we do not share it with advertisers.
            <Bullets
              items={[
                'Telegram — the platform the app runs on. Your use of Telegram is governed by Telegram’s own privacy policy.',
                'Crypto Pay (@CryptoBot) — receives your Telegram user ID and the amount for each invoice and each payout, because that is how a payment is addressed. Their own terms and checks apply to the payment itself.',
                'Our error-monitoring provider — receives technical error reports. Personal data is stripped from them before they are sent.',
                'Our analytics provider — receives usage events under an identifier derived from your Telegram ID by a one-way hash. Your Telegram ID itself is never sent.',
                'Our hosting and backup-storage providers — hold the database and its backups. Backups are encrypted before they leave our server, so the storage provider cannot read them.',
              ]}
            />
            We may also disclose data where we are legally required to, or where it
            is necessary to investigate fraud against us or against other players.
          </Section>

          <Section title="6. How Long We Keep It">
            <Rows
              rows={[
                ['Hand history', 'Deleted automatically after 90 days'],
                ['Account and profile', 'While the account exists'],
                ['Money ledger', 'Kept after closure — accounting and fraud'],
                ['Backups', 'Rolling: 48 hours, 7 days, 90 days'],
                ['Logs', 'Short-lived, for security and debugging'],
              ]}
            />
            <br />
            The money ledger is append-only: entries are never edited or deleted, and
            a correction is written as a new entry. That is what lets any balance,
            including yours, be reconstructed and audited.
          </Section>

          <Section title="7. Security">
            Traffic between your device and us is encrypted in transit. Backups are
            encrypted before they are uploaded, and the key to read them is held
            only by us. Access to the database and to the admin tools is limited to
            the people who run the app, and administrative actions are logged.
            <br />
            <br />
            No system is perfectly secure. Keep your Telegram account secure — with
            it, someone can act as you here.
          </Section>

          <Section title="8. Your Requests">
            Write to support through the Telegram bot that launched this Mini App to:
            <Bullets
              items={[
                'ask what we hold about you, and get a copy of it;',
                'correct your display name or avatar (you can also do this yourself in the profile screen);',
                'close your account and delete your personal data.',
              ]}
            />
            Before an account is deleted, withdraw your balance — deletion does not
            pay it out. After deletion we remove your profile, and the entries left
            in the money ledger and in the administrative log are kept because we
            need them for our accounts and for fraud prevention.
          </Section>

          <Section title="9. Children">
            NightRiver is for adults, 18 and over. We do not knowingly keep data
            about anyone younger; if we learn that an account belongs to a minor, we
            close it.
          </Section>

          <Section title="10. Changes and Contact">
            This policy carries a version and a date at the top. When it changes
            materially we raise the version and ask you to accept it again. Questions
            go to NightRiver support via the Telegram bot that launched this
            Mini App.
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

const Rows: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
    {rows.map(([label, value]) => (
      <div
        key={label}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span style={{ color: 'var(--color-neutral)', flexShrink: 0 }}>{label}</span>
        <span style={{ textAlign: 'right' }}>{value}</span>
      </div>
    ))}
  </div>
);
