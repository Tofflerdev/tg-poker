import React from 'react';
import type { Socket } from 'socket.io-client';
import { Button, Card, Icon } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import logoUrl from '../assets/logo.svg';
import {
  DEFAULT_DEPOSIT_FEE_BPS,
  depositFeeChips,
  formatFeePercent,
  netDepositChips,
} from '../utils/depositFee';
import type { ExtendedServerEvents, ExtendedClientEvents } from '../../../types/index';

/**
 * Deposit — crypto-payments-rake phase 4 §D (client Block 4.4).
 *
 * Real-money deposits in USDT via Crypto Pay. The player picks an amount,
 * `createDeposit` mints an invoice, and the CryptoBot payment flow opens. The
 * balance updates automatically when the paid-invoice webhook lands
 * (`depositCredited`). Peg: 1 chip = $0.01.
 *
 * Crypto Pay takes a commission off every paid invoice, so the chips credited are
 * LESS than the invoice: $50 → 4850 chips at 3%. The screen therefore quotes the
 * breakdown (pay → fee → credited) rather than the gross amount. The rate is not
 * published by the API — the server observes it from paid invoices and sends it
 * as `depositInfo.feeBps`, so a change on Crypto Pay's side follows through here
 * on its own.
 */

// Peg mirror (server: server/payments/peg.ts). 1 chip = 1 cent.
const CHIPS_PER_DOLLAR = 100;
const PRESET_DOLLARS = [5, 10, 20, 50, 100] as const;

const chipsFor = (dollars: number) => dollars * CHIPS_PER_DOLLAR;
const usd = (chips: number) => `$${(chips / CHIPS_PER_DOLLAR).toFixed(2)}`;

type DepositStatus =
  | { kind: 'idle' }
  | { kind: 'creating' }
  | { kind: 'awaiting' } // invoice opened, waiting for payment confirmation
  | { kind: 'credited'; chips: number }
  | { kind: 'error'; message: string };

interface DepositProps {
  onBack: () => void;
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
}

/** Open a Crypto Pay payment URL through the best channel available. */
function openPaymentUrl(url: string): void {
  if (!url) return;
  const wa = (window as any).Telegram?.WebApp;
  const isTelegramLink = /^(https?:\/\/t\.me\/|tg:\/\/)/.test(url);
  if (isTelegramLink && wa?.openTelegramLink) {
    wa.openTelegramLink(url);
  } else if (wa?.openLink) {
    wa.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

export const Deposit: React.FC<DepositProps> = ({ onBack, socket }) => {
  const { setHeaderColor, hapticFeedback } = useTelegram();
  const [dollars, setDollars] = React.useState<number>(10);
  const [status, setStatus] = React.useState<DepositStatus>({ kind: 'idle' });
  const [feeBps, setFeeBps] = React.useState<number>(DEFAULT_DEPOSIT_FEE_BPS);

  React.useEffect(() => {
    setHeaderColor('#0a0a0e');
  }, [setHeaderColor]);

  // Ask the server for the live Crypto Pay commission so the quote below is real.
  React.useEffect(() => {
    const onInfo = (payload: { feeBps: number }) => {
      if (Number.isFinite(payload?.feeBps) && payload.feeBps >= 0) setFeeBps(payload.feeBps);
    };
    socket.on('depositInfo', onInfo);
    socket.emit('getDepositInfo');
    return () => {
      socket.off('depositInfo', onInfo);
    };
  }, [socket]);

  React.useEffect(() => {
    const onInvoice = (payload: { invoiceId: string; payUrl: string; amountChips: number }) => {
      openPaymentUrl(payload.payUrl);
      setStatus({ kind: 'awaiting' });
    };
    const onCredited = (payload: { creditedChips: number; balance: number }) => {
      hapticFeedback?.notificationOccurred('success');
      setStatus({ kind: 'credited', chips: payload.creditedChips });
    };
    const onError = (msg: string) => {
      hapticFeedback?.notificationOccurred('error');
      setStatus({ kind: 'error', message: msg });
    };
    socket.on('depositInvoice', onInvoice);
    socket.on('depositCredited', onCredited);
    socket.on('depositError', onError);
    return () => {
      socket.off('depositInvoice', onInvoice);
      socket.off('depositCredited', onCredited);
      socket.off('depositError', onError);
    };
  }, [socket, hapticFeedback]);

  const handleBack = () => {
    hapticFeedback?.impactOccurred('light');
    onBack();
  };

  const handleDeposit = () => {
    hapticFeedback?.impactOccurred('medium');
    setStatus({ kind: 'creating' });
    socket.emit('createDeposit', { amountChips: chipsFor(dollars) });
  };

  const busy = status.kind === 'creating';
  const chips = chipsFor(dollars);
  const feeChips = depositFeeChips(chips, feeBps);
  const netChips = netDepositChips(chips, feeBps);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(ellipse at top, rgba(255,171,0,0.07) 0%, transparent 55%), #0a0a0e',
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 20px' }}>
        <Button
          variant="neutral"
          onClick={handleBack}
          aria-label="Back to menu"
          style={{ minHeight: 40, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
          <span>Back</span>
        </Button>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <img src={logoUrl} alt="NightRiver" style={{ height: 28, width: 'auto', opacity: 0.9 }} />
        </div>
        <div style={{ width: 72, flexShrink: 0 }} aria-hidden />
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--color-action-raise)',
            textShadow: '0 0 12px var(--glow-raise)',
          }}
        >
          Deposit
        </h1>

        {status.kind === 'credited' ? (
          <Card variant="active" glow padding={24} style={{ textAlign: 'center' }}>
            <Icon
              name="deposit-success"
              size={40}
              variant="active"
              glow
              style={{ marginBottom: 10 }}
            />
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-active)' }}>
              +{status.chips.toLocaleString()} chips
            </div>
            <p style={{ margin: '8px 0 0', color: '#c9d8de', fontSize: 14 }}>
              {usd(status.chips)} credited to your balance.
            </p>
            <Button
              variant="raise"
              onClick={() => setStatus({ kind: 'idle' })}
              style={{ marginTop: 18, width: '100%' }}
            >
              Deposit again
            </Button>
          </Card>
        ) : (
          <>
            {/* Amount picker */}
            <Card variant="neutral" padding={18}>
              <div style={{ fontSize: 12, color: 'var(--color-neutral)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                Choose amount
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {PRESET_DOLLARS.map((d) => {
                  const selected = d === dollars;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        hapticFeedback?.selectionChanged();
                        setDollars(d);
                      }}
                      disabled={busy || status.kind === 'awaiting'}
                      style={{
                        padding: '14px 0',
                        borderRadius: 12,
                        cursor: 'pointer',
                        fontSize: 16,
                        fontWeight: 700,
                        color: selected ? 'var(--color-action-raise)' : '#c9d8de',
                        background: selected
                          ? 'color-mix(in srgb, var(--color-action-raise) 12%, transparent)'
                          : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${selected ? 'color-mix(in srgb, var(--color-action-raise) 60%, transparent)' : 'rgba(255,255,255,0.10)'}`,
                        boxShadow: selected ? 'inset 0 0 12px color-mix(in srgb, var(--color-action-raise) 20%, transparent)' : 'none',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      ${d}
                    </button>
                  );
                })}
              </div>

              {/* Breakdown: what leaves the wallet, what Crypto Pay takes, what
                  actually lands on the balance. */}
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-neutral)' }}>You pay</span>
                  <span style={{ fontSize: 14, fontFamily: 'monospace', color: '#c9d8de' }}>
                    {usd(chips)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, color: 'var(--color-neutral)' }}>
                    Crypto Pay fee ({formatFeePercent(feeBps)})
                  </span>
                  <span style={{ fontSize: 14, fontFamily: 'monospace', color: 'var(--color-action-fold)' }}>
                    −{usd(feeChips)}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#e0f7fa', fontWeight: 600 }}>
                    Credited to balance
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: 'var(--color-action-raise)', textShadow: '0 0 8px var(--glow-raise)' }}>
                    {netChips.toLocaleString()} chips
                  </span>
                </div>
              </div>
            </Card>

            {status.kind === 'awaiting' && (
              <Card variant="neutral" padding={16} style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, color: 'var(--color-active)', fontSize: 14, fontWeight: 600 }}>
                  Complete the payment in CryptoBot
                </p>
                <p style={{ margin: '6px 0 0', color: '#9fb2b8', fontSize: 13 }}>
                  Your balance updates automatically once it clears.
                </p>
              </Card>
            )}

            {status.kind === 'error' && (
              <Card variant="neutral" padding={14} style={{ borderColor: 'color-mix(in srgb, var(--color-action-fold) 50%, transparent)' }}>
                <p style={{ margin: 0, color: 'var(--color-action-fold)', fontSize: 13 }}>{status.message}</p>
              </Card>
            )}

            <Button
              variant="raise"
              onClick={handleDeposit}
              disabled={busy}
              style={{ width: '100%', minHeight: 52, fontSize: 16, fontWeight: 700 }}
            >
              {busy ? 'Creating invoice…' : status.kind === 'awaiting' ? `Pay ${usd(chips)} again` : `Deposit ${usd(chips)}`}
            </Button>

            <p style={{ margin: '2px 4px 0', color: 'var(--color-neutral)', fontSize: 12, lineHeight: 1.5, opacity: 0.8, textAlign: 'center' }}>
              Paid in USDT via Crypto Pay. 1 chip = $0.01. The {formatFeePercent(feeBps)} fee is
              charged by Crypto Pay, not by us — your balance is credited with exactly what arrives.
            </p>
          </>
        )}
      </main>
    </div>
  );
};
