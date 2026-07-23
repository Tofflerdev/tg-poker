import React from 'react';
import { Button, Card } from '../../components/ui';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { Socket } from 'socket.io-client';
import type {
  AdminClientEvents,
  AdminServerEvents,
  AdminState,
} from '../../../../types/index';

type AdminSocket = Socket<AdminServerEvents, AdminClientEvents>;

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminEconomy.
 *
 * Economy tab — StatCards (Total Chips in Play, Active Players) and a recharts
 * BarChart showing chips per table. ResponsiveContainer is wrapped in a Card
 * with explicit height: 320 (Pitfall 7 — 0px parent prevents ResizeObserver).
 */

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => (
  <Card variant="neutral" style={{ padding: 16, flex: 1 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-neutral)',
        marginBottom: 8,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: 28,
        fontWeight: 700,
        color: color ?? 'var(--color-active)',
        textShadow: `0 0 12px ${color ?? 'var(--color-active)'}`,
      }}
    >
      {value}
    </div>
  </Card>
);

interface Props {
  state: AdminState;
  socket: AdminSocket;
}

// crypto-payments-rake phase 4 §K: bankroll top-up control (chips = cents, peg 1 chip = $0.01).
const usd = (chips: number) => `$${(chips / 100).toFixed(2)}`;

export const AdminEconomy: React.FC<Props> = ({ state, socket }) => {
  const tableData = state.tables.map((t) => ({
    name: t.name,
    chips: state.users
      .filter((u) => u.tableId === t.id)
      .reduce((sum, u) => sum + u.chips, 0),
  }));

  // The server routes results through `adminError`; §K bankroll deposit returns a
  // `bankrollInvoice` (a Crypto Pay URL to open), §H house-withdrawal via adminError.
  const [bankrollAmount, setBankrollAmount] = React.useState('');
  const [bankrollFeedback, setBankrollFeedback] = React.useState<{ ok: boolean; message: string } | null>(null);

  // §H: house rake withdrawal.
  const [wdAmount, setWdAmount] = React.useState('');
  const [wdTarget, setWdTarget] = React.useState('');
  const [houseFeedback, setHouseFeedback] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    const onAdminError = (payload: { code: string; message: string }) => {
      if (['BANKROLL_DEPOSIT_FAILED', 'INVALID_AMOUNT'].includes(payload.code)) {
        setBankrollFeedback({ ok: false, message: payload.message });
      } else if (['HOUSE_WITHDRAWN', 'WITHDRAW_FAILED', 'INVALID_WITHDRAWAL'].includes(payload.code)) {
        setHouseFeedback({ ok: payload.code === 'HOUSE_WITHDRAWN', message: payload.message });
      }
    };
    const onBankrollInvoice = (payload: { invoiceId: string; payUrl: string; amountChips: number }) => {
      if (payload.payUrl) window.open(payload.payUrl, '_blank');
      setBankrollFeedback({
        ok: true,
        message: 'Invoice opened — pay it in Crypto Pay; the bankroll credits automatically.',
      });
    };
    socket.on('adminError', onAdminError);
    socket.on('bankrollInvoice', onBankrollInvoice);
    return () => {
      socket.off('adminError', onAdminError);
      socket.off('bankrollInvoice', onBankrollInvoice);
    };
  }, [socket]);

  const submitBankrollDeposit = () => {
    const n = Number.parseInt(bankrollAmount, 10);
    if (!Number.isInteger(n) || n < 500 || n > 100_000_000) {
      alert('Minimum bankroll deposit is 500 chips ($5).');
      return;
    }
    socket.emit('createBankrollDeposit', { amountChips: n });
    setBankrollAmount('');
  };

  const submitWithdraw = () => {
    const n = Number.parseInt(wdAmount, 10);
    const target = Number.parseInt(wdTarget, 10);
    if (!Number.isInteger(n) || n < 1000) {
      alert('Minimum withdrawal is 1000 chips ($10).');
      return;
    }
    if (!Number.isInteger(target) || target < 1) {
      alert("Enter the recipient's Telegram user id (positive integer).");
      return;
    }
    if (n > state.houseBalance) {
      alert('Amount exceeds the house balance.');
      return;
    }
    socket.emit('withdrawHouseRake', { amountChips: n, targetUserId: target });
    setWdAmount('');
  };

  const parsedBankroll = Number.parseInt(bankrollAmount, 10);
  const bankrollHint = Number.isInteger(parsedBankroll) && parsedBankroll > 0 ? `= ${usd(parsedBankroll)}` : '';
  const parsedWd = Number.parseInt(wdAmount, 10);
  const wdHint = Number.isInteger(parsedWd) && parsedWd > 0 ? `= ${usd(parsedWd)}` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <StatCard
          label="Total Chips in Play"
          value={state.totalChipsInPlay.toLocaleString()}
          color="var(--color-chip)"
        />
        <StatCard
          label="Active Players"
          value={String(state.users.length)}
        />
      </div>

      {/* §H: House rake balance + withdraw profit via Crypto Pay transfer. */}
      <Card variant="neutral" style={{ padding: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-neutral)',
            }}
          >
            House Rake
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-chip)' }}>
            {state.houseBalance.toLocaleString()} chips
            <span style={{ color: 'var(--color-neutral)', fontWeight: 400, marginLeft: 6 }}>
              {usd(state.houseBalance)}
            </span>
          </div>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-neutral)', opacity: 0.85 }}>
          Accumulated rake profit. Withdraw to a Telegram user via Crypto Pay (min 1000 chips /
          $10). Never take profit straight from CryptoBot — it desyncs the ledger.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="number"
            placeholder="chips"
            value={wdAmount}
            onChange={(e) => setWdAmount(e.target.value)}
            aria-label="House withdrawal amount in chips"
            style={{ width: 120, height: 40 }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-chip)', minWidth: 64 }}>{wdHint}</span>
          <input
            type="number"
            placeholder="Telegram user id"
            value={wdTarget}
            onChange={(e) => setWdTarget(e.target.value)}
            aria-label="Withdrawal recipient Telegram user id"
            style={{ width: 160, height: 40 }}
          />
          <Button
            variant="fold"
            aria-label="Withdraw house rake"
            style={{ padding: '4px 16px', minHeight: 40 }}
            onClick={submitWithdraw}
          >
            Withdraw
          </Button>
        </div>
        {houseFeedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              fontSize: 13,
              color: houseFeedback.ok ? 'var(--color-action-sit)' : 'var(--color-action-fold)',
            }}
          >
            {houseFeedback.message}
          </div>
        )}
      </Card>

      {/* §K: Bot bankroll float top-up (owner funds bot buy-ins for massovka). */}
      <Card variant="neutral" style={{ padding: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-neutral)',
            }}
          >
            Bot Bankroll
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-action-raise)' }}>
            {state.bankrollBalance.toLocaleString()} chips
            <span style={{ color: 'var(--color-neutral)', fontWeight: 400, marginLeft: 6 }}>
              {usd(state.bankrollBalance)}
            </span>
          </div>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-neutral)', opacity: 0.85 }}>
          Float that funds bot buy-ins on live tables. Fund it with a real Crypto Pay deposit
          (min 500 chips / $5) — opens an invoice; the balance credits when paid. Bots stop
          seating when it runs dry.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="number"
            placeholder="chips"
            value={bankrollAmount}
            onChange={(e) => setBankrollAmount(e.target.value)}
            aria-label="Bankroll deposit amount in chips"
            style={{ width: 140, height: 40 }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-action-raise)', minWidth: 72 }}>{bankrollHint}</span>
          <Button
            variant="raise"
            aria-label="Deposit to bot bankroll"
            style={{ padding: '4px 16px', minHeight: 40 }}
            onClick={submitBankrollDeposit}
          >
            Deposit to Bankroll
          </Button>
        </div>
        {bankrollFeedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              fontSize: 13,
              color: bankrollFeedback.ok ? 'var(--color-action-sit)' : 'var(--color-action-fold)',
            }}
          >
            {bankrollFeedback.message}
          </div>
        )}
      </Card>
      <Card variant="neutral" style={{ padding: 16, height: 320 }}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={tableData}>
            <CartesianGrid
              stroke="color-mix(in srgb, var(--color-neutral) 15%, transparent)"
            />
            <XAxis
              dataKey="name"
              stroke="var(--color-neutral)"
              fontSize={13}
            />
            <YAxis stroke="var(--color-neutral)" fontSize={13} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,10,14,0.95)',
                border: '1.5px solid var(--color-active)',
                fontSize: 13,
                color: '#fff',
              }}
            />
            <Bar dataKey="chips" fill="var(--color-chip)" fillOpacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};
