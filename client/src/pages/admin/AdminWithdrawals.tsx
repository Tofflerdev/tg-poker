import React from 'react';
import { Button, Card } from '../../components/ui';
import type { Socket } from 'socket.io-client';
import type {
  AdminClientEvents,
  AdminServerEvents,
  AdminState,
  AdminWithdrawalRequest,
} from '../../../../types/index';

type AdminSocket = Socket<AdminServerEvents, AdminClientEvents>;

/**
 * crypto-payments-rake phase 5 §I — the payout approval queue.
 *
 * Every player withdrawal is settled by hand here: Approve fires the Crypto Pay
 * transfer, Reject returns the held chips. The §I flags are ADVISORY — they
 * colour a row so a human looks closer; nothing is ever auto-blocked or banned,
 * because at our volumes a false positive costs more than a manual glance.
 */
const usd = (chips: number) => `$${(chips / 100).toFixed(2)}`;

const FLAG_COPY: Record<string, { label: string; hint: string }> = {
  POSSIBLE_TRANSIT: {
    label: 'possible transit',
    hint: 'Cashing out most of a deposit after very little play — the laundering shape.',
  },
  NO_HANDS_SINCE_DEPOSIT: {
    label: 'no hands since deposit',
    hint: 'Deposited and is withdrawing without playing a single hand.',
  },
  NEVER_DEPOSITED: {
    label: 'never deposited',
    hint: 'Withdrawing pure winnings — worth a look at where the chips came from.',
  },
};

const Flag: React.FC<{ code: string }> = ({ code }) => {
  const copy = FLAG_COPY[code] ?? { label: code.toLowerCase().replace(/_/g, ' '), hint: '' };
  return (
    <span
      title={copy.hint}
      style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 999,
        color: 'var(--color-action-fold)',
        border: '1px solid color-mix(in srgb, var(--color-action-fold) 45%, transparent)',
        background: 'color-mix(in srgb, var(--color-action-fold) 10%, transparent)',
        whiteSpace: 'nowrap',
      }}
    >
      ⚑ {copy.label}
    </span>
  );
};

interface Props {
  state: AdminState;
  socket: AdminSocket;
}

export const AdminWithdrawals: React.FC<Props> = ({ state, socket }) => {
  const queue: AdminWithdrawalRequest[] = state.pendingWithdrawals ?? [];
  const [feedback, setFeedback] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onAdminError = (payload: { code: string; message: string }) => {
      if (['WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 'WITHDRAWAL_SETTLE_FAILED', 'INVALID_WITHDRAWAL'].includes(payload.code)) {
        setBusyId(null);
        setFeedback({
          ok: payload.code === 'WITHDRAWAL_APPROVED' || payload.code === 'WITHDRAWAL_REJECTED',
          message: payload.message,
        });
      }
    };
    socket.on('adminError', onAdminError);
    return () => {
      socket.off('adminError', onAdminError);
    };
  }, [socket]);

  const approve = (req: AdminWithdrawalRequest) => {
    if (!window.confirm(`Send ${usd(req.amountChips)} to ${req.displayName} (${req.telegramId})?`)) return;
    setBusyId(req.spendId);
    socket.emit('approveWithdrawal', { spendId: req.spendId });
  };

  const reject = (req: AdminWithdrawalRequest) => {
    const reason = window.prompt(`Reject ${usd(req.amountChips)} for ${req.displayName}. Reason:`, '');
    if (reason === null) return;
    setBusyId(req.spendId);
    socket.emit('rejectWithdrawal', { spendId: req.spendId, reason });
  };

  const total = queue.reduce((sum, r) => sum + r.amountChips, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card variant="neutral" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-neutral)' }}>
            Pending payouts
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-active)' }}>
            {queue.length} · {usd(total)}
          </div>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-neutral)', opacity: 0.85 }}>
          Chips are already held off the player's balance. Approve sends USDT via Crypto Pay to the
          player's Telegram account; Reject returns the chips. Flags are hints for you, not blocks.
        </p>
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

      {queue.length === 0 ? (
        <Card variant="neutral" style={{ padding: 24, textAlign: 'center' }}>
          <span style={{ color: 'var(--color-neutral)', fontSize: 14 }}>No withdrawal requests waiting.</span>
        </Card>
      ) : (
        queue.map((req) => (
          <Card key={req.spendId} variant="neutral" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e0f7fa' }}>
                  {req.displayName}{' '}
                  <span style={{ fontSize: 12, color: 'var(--color-neutral)', fontWeight: 400 }}>
                    id {req.telegramId}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-neutral)', marginTop: 4 }}>
                  {new Date(req.createdAt).toLocaleString()} · {req.handsSinceDeposit} hands since deposit ·
                  deposited {usd(req.totalDepositedChips)} total
                </div>
                {req.flags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {req.flags.map((f) => (
                      <Flag key={f} code={f} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: 'var(--color-chip)' }}>
                  {usd(req.amountChips)}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="sit"
                    aria-label={`Approve withdrawal ${req.spendId}`}
                    disabled={busyId === req.spendId}
                    style={{ padding: '4px 16px', minHeight: 40 }}
                    onClick={() => approve(req)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="fold"
                    aria-label={`Reject withdrawal ${req.spendId}`}
                    disabled={busyId === req.spendId}
                    style={{ padding: '4px 16px', minHeight: 40 }}
                    onClick={() => reject(req)}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
