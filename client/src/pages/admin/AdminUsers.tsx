import React, { useState } from 'react';
import { Button, Card, Badge } from '../../components/ui';
import type { Socket } from 'socket.io-client';
import type {
  AdminClientEvents,
  AdminServerEvents,
  AdminState,
} from '../../../../types/index';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminUsers.
 *
 * Users tab — live list of all connected users with Kick / Ban (inline confirm)
 * + BalanceDeltaInput + Apply Delta. Uses existing Neon Strip primitives.
 */

type AdminSocket = Socket<AdminServerEvents, AdminClientEvents>;

interface Props {
  state: AdminState;
  socket: AdminSocket;
}

export const AdminUsers: React.FC<Props> = ({ state, socket }) => {
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [deltaInputs, setDeltaInputs] = useState<Record<string, string>>({});

  const submitDelta = (telegramId: string) => {
    const raw = deltaInputs[telegramId] ?? '';
    const n = Number.parseInt(raw, 10);
    if (!Number.isInteger(n) || n === 0 || n < -100000 || n > 100000) {
      alert('Delta must be a non-zero integer in [-100000, 100000].');
      return;
    }
    socket.emit('grantBalance', { telegramId, delta: n });
    setDeltaInputs({ ...deltaInputs, [telegramId]: '' });
  };

  if (state.users.length === 0) {
    return (
      <Card variant="neutral" style={{ padding: 16 }}>
        No active users.
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {state.users.map((u) => {
        const status = u.bannedAt ? 'banned' : u.tableId ? 'seated' : 'standing';
        const statusVariant =
          status === 'banned' ? 'fold' : status === 'seated' ? 'active' : 'neutral';
        const statusLabel =
          status === 'banned' ? 'Banned' : status === 'seated' ? 'Seated' : 'Standing';
        const deltaRaw = deltaInputs[u.telegramId] ?? '';
        const deltaParsed = Number.parseInt(deltaRaw, 10);
        const prefix =
          Number.isInteger(deltaParsed) && deltaParsed !== 0
            ? deltaParsed > 0
              ? '+'
              : '−'
            : '';
        const prefixColor =
          deltaParsed > 0
            ? 'var(--color-action-sit)'
            : deltaParsed < 0
            ? 'var(--color-action-fold)'
            : 'var(--color-neutral)';

        return (
          <Card key={u.telegramId} variant="neutral" style={{ padding: '8px 12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                minHeight: 52,
              }}
            >
              <span style={{ flex: '1 1 auto', color: 'white', fontSize: 14 }}>
                {u.displayName}
              </span>
              <Badge variant={statusVariant}>{statusLabel}</Badge>
              <span style={{ fontSize: 13, color: 'var(--color-action-raise)' }}>
                {u.chips} chips
              </span>
              <Button
                variant="fold"
                aria-label={`Kick player ${u.displayName}`}
                style={{ padding: '4px 12px', minHeight: 36 }}
                onClick={() => setConfirmKick(u.telegramId)}
              >
                Kick
              </Button>
              <Button
                variant="fold"
                emphasis
                aria-label={`Ban player ${u.displayName}`}
                style={{ padding: '4px 12px', minHeight: 36 }}
                onClick={() => setConfirmBan(u.telegramId)}
              >
                Ban
              </Button>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: prefixColor,
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {prefix}
              </span>
              <input
                type="number"
                placeholder="±0"
                value={deltaRaw}
                onChange={(e) =>
                  setDeltaInputs({ ...deltaInputs, [u.telegramId]: e.target.value })
                }
                style={{ width: 80, height: 36 }}
              />
              <Button
                variant="active"
                style={{ padding: '4px 12px', minHeight: 36 }}
                onClick={() => submitDelta(u.telegramId)}
              >
                Apply Delta
              </Button>
            </div>

            {confirmKick === u.telegramId && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  fontSize: 13,
                  color: 'var(--color-neutral)',
                }}
              >
                <span style={{ flex: 1 }}>
                  {`Kick ${u.displayName}? Their session will end immediately.`}
                </span>
                <Button
                  variant="fold"
                  emphasis
                  style={{ padding: '4px 12px', minHeight: 36 }}
                  onClick={() => {
                    socket.emit('kickUser', { telegramId: u.telegramId });
                    setConfirmKick(null);
                  }}
                >
                  Confirm Kick
                </Button>
                <Button
                  variant="neutral"
                  style={{ padding: '4px 12px', minHeight: 36 }}
                  onClick={() => setConfirmKick(null)}
                >
                  Keep User
                </Button>
              </div>
            )}

            {confirmBan === u.telegramId && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  fontSize: 13,
                  color: 'var(--color-neutral)',
                }}
              >
                <span style={{ flex: 1 }}>
                  {`Ban ${u.displayName}? They will be unable to join tables.`}
                </span>
                <Button
                  variant="fold"
                  emphasis
                  style={{ padding: '4px 12px', minHeight: 36 }}
                  onClick={() => {
                    socket.emit('banUser', { telegramId: u.telegramId });
                    setConfirmBan(null);
                  }}
                >
                  Confirm Ban
                </Button>
                <Button
                  variant="neutral"
                  style={{ padding: '4px 12px', minHeight: 36 }}
                  onClick={() => setConfirmBan(null)}
                >
                  Keep User
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};
