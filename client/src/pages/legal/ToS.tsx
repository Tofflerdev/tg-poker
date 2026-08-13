import React, { useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { useTelegram } from '../../hooks/useTelegram';
import { LEGAL_UPDATED, LEGAL_VERSION } from './legalMeta';

/**
 * Terms of Service — Plan 02-08 / D-26 / COMPLIANCE-01.
 *
 * Static legal copy, Neon Strip styled, reachable from:
 *   - Main Menu footer ("Terms")
 *   - Profile / Settings legal links
 *   - Inline link on Consent page.
 *
 * The component is pure: no socket, no data fetch. Reachable from any consent
 * or non-consent context — back button returns to wherever the caller chose
 * (Consent for unaccepted users, MainMenu otherwise — decided by App.tsx).
 *
 * v2.0 rewrite (real money). Every number below is mirrored from code, not
 * invented — keep them in sync when the code moves:
 *   peg + minimums        server/payments/peg.ts
 *   deposit ceiling       server/index.ts (createDeposit guard)
 *   invoice lifetime      server/payments/cryptoPay.ts (INVOICE_TTL_SECONDS)
 *   deposit commission    server/payments/depositFee.ts (observed, 3% default)
 *   rake + caps           server/rake.ts, server/config/tables.ts
 *   payout limits         server/payments/withdrawalPolicy.ts
 *   hold → approve → send server/payments/withdrawals.ts
 *   turn timeout, grace   server/Game.ts, server/GraceRegistry.ts
 */

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
            Version {LEGAL_VERSION} — NightRiver
            <br />
            Last updated: {LEGAL_UPDATED}
          </Meta>

          <Callout>
            NightRiver is a <strong>real-money</strong> poker app. You play against
            other players for money, you pay a fee on the pots you win, and you can
            lose everything you deposit.
          </Callout>

          <Section title="1. Acceptance of Terms">
            By using NightRiver you agree to these Terms of Service. If you do not
            accept them, do not use the app. "We" and "us" mean the team that runs
            NightRiver; "you" means the holder of the Telegram account used to open
            it. We may update these Terms — see section 14.
          </Section>

          <Section title="2. What NightRiver Is">
            NightRiver offers six-max Texas Hold'em cash games played for real
            money. Your balance is denominated in chips at a fixed rate of{' '}
            <strong>1 chip = $0.01 USDT</strong>. Chips are funded by depositing
            USDT and can be converted back to USDT by requesting a withdrawal.
            <br />
            <br />
            Poker played for money carries a real risk of loss. Money you deposit is
            not a deposit in the banking sense, is not an investment, earns nothing,
            and is not protected by any deposit-guarantee scheme. Play only with
            money you can afford to lose — see Responsible Gaming.
            <br />
            <br />
            NightRiver is a poker room, not a currency service. We do not buy, sell,
            or exchange digital assets for you, and we do not offer wallets or
            custody as a service. Chips exist to be played at our tables; deposits
            and withdrawals move USDT for that purpose and no other.
          </Section>

          <Section title="3. Eligibility">
            You must be at least 18 years old. You are responsible for checking
            that playing poker for money is lawful for you where you are, and you
            must not use the app if it is not.
            <br />
            <br />
            Your account is your Telegram account. One account per person: multiple
            accounts held by one person are a breach of these Terms (section 9).
            Accounts cannot be sold, shared, or transferred, and you are responsible
            for everything done through yours — keep your Telegram account secure.
          </Section>

          <Section title="4. Deposits">
            Deposits are made in USDT through Crypto Pay (the @CryptoBot payment
            service). How it works:
            <Bullets
              items={[
                'You choose an amount in the app; we create a Crypto Pay invoice and open it for you. An unpaid invoice expires after 1 hour — after that, start a new one.',
                'Minimum deposit: $5 (500 chips).',
                'Crypto Pay charges a commission on every paid invoice — 3% at the time of writing. It is set by Crypto Pay, not by us, and we receive it no more than you do.',
                'The commission is taken out of your payment, so the chips credited are less than the invoice. The deposit screen shows the full breakdown — what you pay, the commission, and what lands on your balance — before you pay anything.',
                'Your balance is credited with exactly what actually arrives, and only after the payment clears. This is normally within seconds; if a confirmation is delayed, a reconciliation job credits the payment when it is found.',
              ]}
            />
            We never see or store your wallet, private keys, card details, or seed
            phrase — the payment happens entirely inside Crypto Pay. Deposits must
            come from your own Telegram account; do not pay for someone else's
            balance or ask someone else to pay for yours.
          </Section>

          <Section title="5. Rake — How We Are Paid">
            We take a fee, called rake, from pots that are played out. This is how
            the app earns; there is no other charge from us for playing.
            <Bullets
              items={[
                'Rake is 5% of the raked pot, capped per hand as listed below.',
                'No flop, no drop: if a hand ends before the flop is dealt, no rake is taken at all.',
                'An uncalled bet — the part of a bet nobody matched — is returned to you and is never raked.',
                'Rake is taken at the end of the hand, before the pot is awarded. Side pots are raked under the same single per-hand cap, never twice.',
                'Every raked hand is recorded and visible in your hand history.',
              ]}
            />
            <RakeTable />
          </Section>

          <Section title="6. Tables, Buy-ins and Play">
            <Bullets
              items={[
                'Buy-in is a range of 40–100 big blinds. Chips you bring to a table are moved out of your balance and back into it when you leave the table.',
                'Each table has a turn timer of 15–30 seconds. If it runs out, your hand is checked when checking is free and folded when you are facing a bet.',
                'If you disconnect, you have 2 minutes to come back to your seat. After that the seat is released and your remaining chips return to your balance. A hand already in progress plays out under the timer rules above.',
                'You can sit out or leave the table at any time between hands. Chips committed to a hand in progress stay in that pot — leaving does not take them back.',
                'Table stakes: you can only ever win or lose the chips you brought to the table for the hand being played.',
              ]}
            />
          </Section>

          <Section title="7. Withdrawals">
            You can convert your chip balance back to USDT at the same rate,
            1 chip = $0.01.
            <Bullets
              items={[
                'Minimum withdrawal: $10 (1,000 chips). Maximum per request: $25,000 — the limit of a single Crypto Pay transfer.',
                'Rolling limit: $500 (50,000 chips) per account per 24 hours.',
                'When you submit a request, the chips are held immediately — they leave your balance and cannot be played while the request is open.',
                'Every payout is reviewed by a person before it is sent. This is normally done within 24 hours.',
                'On approval the USDT is sent through Crypto Pay to the same Telegram account that requested it. Payouts to anyone else, or to an external address, are not possible — by design, not by policy.',
                'If a request is rejected, the full amount is returned to your balance. We charge no fee for a withdrawal, whether it is approved or rejected.',
                'If we suspect fraud, or that an account is not being used by the person who owns it, we may ask you to confirm control of that Telegram account before a payout is sent — never a passport, an address, or a photo of you.',
              ]}
            />
            We may hold a payout while we look into a request — for example when the
            pattern suggests collusion, chip dumping, or an account being used to
            move money rather than to play. We will tell you when a request is being
            reviewed for that reason.
          </Section>

          <Section title="8. Summary of Charges">
            <Rows
              rows={[
                ['Deposit', '3% — charged by Crypto Pay, not by us'],
                ['Playing', '5% rake on played-out pots, capped per hand'],
                ['Withdrawal', 'No charge from us'],
              ]}
            />
          </Section>

          <Section title="9. Fair Play">
            The following are prohibited and are grounds for suspension:
            <Bullets
              items={[
                'Collusion — playing as a team, sharing hole-card information, or soft-playing an accomplice.',
                'Chip dumping — losing chips to another account on purpose, including to move money between accounts.',
                'Holding more than one account, or playing on an account that is not yours.',
                'Playing through software that acts for you, or using real-time assistance such as solvers or odds tools during a hand.',
                'Exploiting a bug or a payment fault instead of reporting it.',
                'Harassing other players in chat.',
              ]}
            />
            We review play to find this: hands, ledger entries, and links between
            accounts are examined both automatically and by hand. Playing here means
            accepting that review.
            <br />
            <br />
            Where we find that any of these happened, we may end your sessions, hold
            payouts while we investigate, suspend the account, and withhold a balance
            that we can show was obtained this way. A balance that was not obtained
            this way stays yours and remains withdrawable.
          </Section>

          <Section title="10. Errors and Corrections">
            Every movement of money is written to a ledger, so any balance can be
            reconstructed. If a software fault affects a hand or a balance — a
            mis-dealt hand, a payment credited twice, a payout recorded wrongly — we
            may void the affected hands and correct the balances to what they should
            have been. Chips credited to you in error are not yours to keep, and we
            will explain any correction we make to your balance.
          </Section>

          <Section title="11. Suspension and Closing Your Account">
            We may suspend or close an account that breaches these Terms. You can
            close yours at any time through support. In either case a legitimate
            balance remains yours to withdraw, subject to the limits and the review
            in section 7.
          </Section>

          <Section title="12. Availability and Things Outside Our Control">
            The app is provided as is. Deposits and withdrawals depend on Crypto Pay,
            on Telegram, and on the blockchain — outages or delays in any of them can
            hold up a payment, and we cannot shorten them. We are not liable for
            losses caused by those services, by your own device or connection, or by
            the ordinary outcome of poker hands: money lost to other players at the
            table is lost.
            <br />
            <br />
            To the extent the law allows, we are not liable for indirect or
            consequential losses. Nothing here limits liability for our own fraud.
          </Section>

          <Section title="13. Chat and Conduct">
            Table chat is public to everyone at the table and is kept only briefly.
            Do not use it for abuse, spam, advertising, or to arrange anything
            described in section 9.
          </Section>

          <Section title="14. Changes to These Terms">
            These Terms carry a version number and a date at the top. When we change
            them materially — anything affecting money, fees, or your account — we
            raise the version and ask you to accept the new one before you continue
            playing. Smaller corrections take effect when published.
          </Section>

          <Section title="15. Governing Law and Disputes">
            These Terms are governed by the law of the jurisdiction in which
            NightRiver operates.
            <br />
            <br />
            If something goes wrong, write to support first — most things are settled
            there, and we will answer. If it cannot be settled that way, both sides
            will attempt mediation in good faith before going further. A dispute that
            mediation does not resolve is subject to the courts of the place where
            NightRiver operates.
          </Section>

          <Section title="16. Contact">
            Questions, complaints, and account requests go to NightRiver support via
            the Telegram bot that launched this Mini App. Tell us your Telegram
            account and, for anything about a payment, the amount and approximate
            time — that is enough for us to find it in the ledger.
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

/** Amber-bordered lead-in: the one thing a player must not miss. */
const Callout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      margin: '0 0 20px',
      padding: '12px 14px',
      borderRadius: 10,
      color: '#e0f7fa',
      fontSize: 14,
      background: 'color-mix(in srgb, var(--color-action-raise) 8%, transparent)',
      border: '1.5px solid color-mix(in srgb, var(--color-action-raise) 45%, transparent)',
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

/**
 * Per-hand rake caps, in big blinds. Mirrors server/config/tables.ts — the two
 * Beginner and two Standard tables share a cap, so they are listed once each.
 */
const RakeTable: React.FC = () => (
  <div style={{ marginTop: 12 }}>
    <div
      style={{
        fontSize: 11,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--color-neutral)',
        marginBottom: 8,
      }}
    >
      Per-hand cap by table
    </div>
    <Rows
      rows={[
        ['Funnel — $0.01/$0.02', '3 BB ($0.06)'],
        ['Beginner — $0.05/$0.10', '4 BB ($0.40)'],
        ['Standard — $0.10/$0.20', '4 BB ($0.80)'],
        ['Pro — $0.25/$0.50', '3 BB ($1.50)'],
        ['High Stakes — $1/$2', '2.5 BB ($5.00)'],
      ]}
    />
  </div>
);
