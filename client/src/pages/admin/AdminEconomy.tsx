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

  // §K: bot bankroll top-up. The server routes both success and failure through
  // `adminError`; we surface the bankroll-related codes here as inline feedback.
  const [topUpAmount, setTopUpAmount] = React.useState('');
  const [feedback, setFeedback] = React.useState<{ ok: boolean; message: string } | null>(null);

  React.useEffect(() => {
    const onAdminError = (payload: { code: string; message: string }) => {
      if (!['BANKROLL_TOPPED_UP', 'TOPUP_FAILED', 'INVALID_AMOUNT'].includes(payload.code)) return;
      setFeedback({ ok: payload.code === 'BANKROLL_TOPPED_UP', message: payload.message });
    };
    socket.on('adminError', onAdminError);
    return () => { socket.off('adminError', onAdminError); };
  }, [socket]);

  const submitTopUp = () => {
    const n = Number.parseInt(topUpAmount, 10);
    if (!Number.isInteger(n) || n < 1 || n > 100_000_000) {
      alert('Amount must be a positive integer chip amount (1 chip = $0.01).');
      return;
    }
    socket.emit('topUpBankroll', { amountChips: n });
    setTopUpAmount('');
  };

  const parsedTopUp = Number.parseInt(topUpAmount, 10);
  const topUpHint = Number.isInteger(parsedTopUp) && parsedTopUp > 0 ? `= ${usd(parsedTopUp)}` : '';

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
          Float that funds bot buy-ins on live tables. Top up with your own funds; bots stop
          seating when it runs dry.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="number"
            placeholder="chips"
            value={topUpAmount}
            onChange={(e) => setTopUpAmount(e.target.value)}
            aria-label="Bankroll top-up amount in chips"
            style={{ width: 140, height: 40 }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-action-raise)', minWidth: 72 }}>{topUpHint}</span>
          <Button
            variant="raise"
            aria-label="Top up bot bankroll"
            style={{ padding: '4px 16px', minHeight: 40 }}
            onClick={submitTopUp}
          >
            Top Up Bankroll
          </Button>
        </div>
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              fontSize: 13,
              color: feedback.ok ? 'var(--color-action-sit)' : 'var(--color-action-fold)',
            }}
          >
            {feedback.message}
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
