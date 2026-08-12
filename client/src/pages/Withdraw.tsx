import React from 'react';
import type { Socket } from 'socket.io-client';
import { Button, Card } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import logoUrl from '../assets/logo.svg';
import type {
  ExtendedServerEvents,
  ExtendedClientEvents,
  WithdrawalHistoryRow,
} from '../../../types/index';

/**
 * Withdraw — crypto-payments-rake phase 5 §I.
 *
 * The player asks for a payout to their own Telegram account (Crypto Pay
 * transfers by user_id, so there is no address to mistype). The chips are held
 * the moment the request is accepted — they leave the balance immediately and
 * cannot also be played — and an admin settles the request: paid out, or
 * refunded back to the balance.
 *
 * Limits (minimum, rolling daily cap, activity threshold) come from the server
 * via `withdrawalInfo`; this screen never hard-codes a policy number.
 */
const CHIPS_PER_DOLLAR = 100;
const usd = (chips: number) => `$${(chips / CHIPS_PER_DOLLAR).toFixed(2)}`;

interface WithdrawalInfo {
  available: boolean;
  balanceChips: number;
  minChips: number;
  maxAvailableChips: number;
  remainingDailyChips: number;
  handsSinceDeposit: number;
  requiredHands: number;
  blockedBy: string | null;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'requested'; chips: number }
  | { kind: 'settled'; status: 'completed' | 'failed'; chips: number }
  | { kind: 'error'; message: string };

interface WithdrawProps {
  onBack: () => void;
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--color-action-raise)',
  completed: 'var(--color-action-sit)',
  failed: 'var(--color-action-fold)',
};

export const Withdraw: React.FC<WithdrawProps> = ({ onBack, socket }) => {
  const { setHeaderColor, hapticFeedback } = useTelegram();
  const [info, setInfo] = React.useState<WithdrawalInfo | null>(null);
  const [history, setHistory] = React.useState<WithdrawalHistoryRow[]>([]);
  const [amount, setAmount] = React.useState('');
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });

  React.useEffect(() => {
    setHeaderColor('#0a0a0e');
  }, [setHeaderColor]);

  const refresh = React.useCallback(() => {
    socket.emit('getWithdrawalInfo');
    socket.emit('getWithdrawalHistory');
  }, [socket]);

  React.useEffect(() => {
    const onInfo = (payload: WithdrawalInfo) => setInfo(payload);
    const onHistory = (rows: WithdrawalHistoryRow[]) => setHistory(rows);
    const onRequested = (payload: { amountChips: number }) => {
      hapticFeedback?.notificationOccurred('success');
      setStatus({ kind: 'requested', chips: payload.amountChips });
      setAmount('');
      refresh();
    };
    const onSettled = (payload: { status: 'completed' | 'failed'; amountChips: number }) => {
      hapticFeedback?.notificationOccurred(payload.status === 'completed' ? 'success' : 'warning');
      setStatus({ kind: 'settled', status: payload.status, chips: payload.amountChips });
      refresh();
    };
    const onError = (msg: string) => {
      hapticFeedback?.notificationOccurred('error');
      setStatus({ kind: 'error', message: msg });
    };
    socket.on('withdrawalInfo', onInfo);
    socket.on('withdrawalHistory', onHistory);
    socket.on('withdrawalRequested', onRequested);
    socket.on('withdrawalUpdated', onSettled);
    socket.on('withdrawalError', onError);
    refresh();
    return () => {
      socket.off('withdrawalInfo', onInfo);
      socket.off('withdrawalHistory', onHistory);
      socket.off('withdrawalRequested', onRequested);
      socket.off('withdrawalUpdated', onSettled);
      socket.off('withdrawalError', onError);
    };
  }, [socket, hapticFeedback, refresh]);

  const parsed = Number.parseInt(amount, 10);
  const valid = Number.isInteger(parsed) && parsed > 0;
  const busy = status.kind === 'submitting';
  const blocked = info?.blockedBy === 'NOT_ENOUGH_HANDS';
  const canSubmit =
    Boolean(info?.available) && !blocked && valid && !busy && parsed >= (info?.minChips ?? 0);

  const submit = () => {
    if (!canSubmit) return;
    hapticFeedback?.impactOccurred('medium');
    setStatus({ kind: 'submitting' });
    socket.emit('requestWithdrawal', { amountChips: parsed });
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 20px' }}>
        <Button
          variant="neutral"
          onClick={() => {
            hapticFeedback?.impactOccurred('light');
            onBack();
          }}
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
            color: 'var(--color-active)',
            textShadow: '0 0 12px var(--glow-active, rgba(0,229,255,0.4))',
          }}
        >
          Withdraw
        </h1>

        {info && !info.available && (
          <Card variant="neutral" padding={16}>
            <p style={{ margin: 0, color: 'var(--color-action-fold)', fontSize: 13 }}>
              Withdrawals are temporarily unavailable.
            </p>
          </Card>
        )}

        {blocked && info && (
          <Card variant="neutral" padding={16}>
            <p style={{ margin: 0, color: 'var(--color-action-raise)', fontSize: 13, lineHeight: 1.5 }}>
              Play {Math.max(0, info.requiredHands - info.handsSinceDeposit)} more hand
              {info.requiredHands - info.handsSinceDeposit === 1 ? '' : 's'} before withdrawing.
              You have played {info.handsSinceDeposit} since your last deposit.
            </p>
          </Card>
        )}

        <Card variant="neutral" padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <Row label="Your balance" value={`${(info?.balanceChips ?? 0).toLocaleString()} chips`} sub={usd(info?.balanceChips ?? 0)} />
            <Row label="Available to withdraw" value={`${(info?.maxAvailableChips ?? 0).toLocaleString()} chips`} sub={usd(info?.maxAvailableChips ?? 0)} highlight />
            <Row label="Left in today's limit" value={`${(info?.remainingDailyChips ?? 0).toLocaleString()} chips`} sub={usd(info?.remainingDailyChips ?? 0)} />
            <Row label="Minimum" value={`${(info?.minChips ?? 0).toLocaleString()} chips`} sub={usd(info?.minChips ?? 0)} />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              inputMode="numeric"
              placeholder="chips"
              aria-label="Withdrawal amount in chips"
              value={amount}
              disabled={busy || blocked || !info?.available}
              onChange={(e) => setAmount(e.target.value)}
              style={{
                flex: 1,
                minHeight: 48,
                padding: '0 12px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1.5px solid rgba(255,255,255,0.12)',
                color: '#e0f7fa',
                fontSize: 16,
                fontFamily: 'monospace',
              }}
            />
            <Button
              variant="neutral"
              onClick={() => setAmount(String(info?.maxAvailableChips ?? 0))}
              disabled={!info || info.maxAvailableChips <= 0}
              aria-label="Withdraw the maximum available"
              style={{ minHeight: 48, padding: '0 14px', fontSize: 12 }}
            >
              Max
            </Button>
          </div>
          {valid && (
            <p style={{ margin: '10px 2px 0', fontSize: 13, color: 'var(--color-neutral)' }}>
              You receive <strong style={{ color: 'var(--color-active)' }}>{usd(parsed)}</strong> in USDT
            </p>
          )}
        </Card>

        {status.kind === 'requested' && (
          <Card variant="active" padding={16}>
            <p style={{ margin: 0, color: 'var(--color-active)', fontSize: 14, fontWeight: 600 }}>
              Request submitted — {status.chips.toLocaleString()} chips held
            </p>
            <p style={{ margin: '6px 0 0', color: '#9fb2b8', fontSize: 13 }}>
              It is reviewed manually. The USDT arrives in your CryptoBot balance once approved.
            </p>
          </Card>
        )}

        {status.kind === 'settled' && (
          <Card variant="neutral" padding={16}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: status.status === 'completed' ? 'var(--color-action-sit)' : 'var(--color-action-fold)',
              }}
            >
              {status.status === 'completed'
                ? `Paid out — ${usd(status.chips)} sent to your CryptoBot balance.`
                : `Returned — ${status.chips.toLocaleString()} chips are back on your balance.`}
            </p>
          </Card>
        )}

        {status.kind === 'error' && (
          <Card variant="neutral" padding={14} style={{ borderColor: 'color-mix(in srgb, var(--color-action-fold) 50%, transparent)' }}>
            <p style={{ margin: 0, color: 'var(--color-action-fold)', fontSize: 13 }}>{status.message}</p>
          </Card>
        )}

        <Button
          variant="active"
          onClick={submit}
          disabled={!canSubmit}
          style={{ width: '100%', minHeight: 52, fontSize: 16, fontWeight: 700 }}
        >
          {busy ? 'Submitting…' : valid ? `Withdraw ${usd(parsed)}` : 'Withdraw'}
        </Button>

        {history.length > 0 && (
          <Card variant="neutral" padding={16}>
            <div style={{ fontSize: 12, color: 'var(--color-neutral)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Recent withdrawals
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((row) => (
                <div key={row.spendId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
                  <span style={{ color: '#c9d8de', fontFamily: 'monospace' }}>{usd(row.amountChips)}</span>
                  <span style={{ color: STATUS_COLOR[row.status] ?? 'var(--color-neutral)' }}>
                    {row.status === 'pending' ? 'awaiting approval' : row.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        <p style={{ margin: '2px 4px 0', color: 'var(--color-neutral)', fontSize: 12, lineHeight: 1.5, opacity: 0.8, textAlign: 'center' }}>
          Paid in USDT to the Telegram account you are signed in with. 1 chip = $0.01.
          Requests are approved manually.
        </p>
      </main>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; sub: string; highlight?: boolean }> = ({
  label,
  value,
  sub,
  highlight,
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
    <span style={{ fontSize: 13, color: 'var(--color-neutral)' }}>{label}</span>
    <span
      style={{
        fontSize: highlight ? 16 : 14,
        fontWeight: highlight ? 800 : 500,
        fontFamily: 'monospace',
        color: highlight ? 'var(--color-active)' : '#c9d8de',
      }}
    >
      {value} <span style={{ color: 'var(--color-neutral)', fontWeight: 400 }}>{sub}</span>
    </span>
  </div>
);
