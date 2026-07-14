import React, { useState } from 'react';
import { Button, Card, Badge } from '../../components/ui';
import type { Socket } from 'socket.io-client';
import type {
  AdminClientEvents,
  AdminServerEvents,
  AdminState,
  AdminTableInfo,
} from '../../../../types/index';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminTables.
 *
 * Tables tab — live list of all configured tables with Enable / Disable /
 * Drain / Edit inline controls. Uses existing Neon Strip Button / Card / Badge
 * primitives. Drain and Edit expand inline confirmation / edit rows per UI-SPEC.
 */

type AdminSocket = Socket<AdminServerEvents, AdminClientEvents>;

interface Props {
  state: AdminState;
  socket: AdminSocket;
}

const STATUS_VARIANT: Record<AdminTableInfo['status'], 'active' | 'neutral' | 'raise'> = {
  enabled: 'active',
  disabled: 'neutral',
  draining: 'raise',
};

const STATUS_LABEL: Record<AdminTableInfo['status'], string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
  draining: 'Draining',
};

export const AdminTables: React.FC<Props> = ({ state, socket }) => {
  const [confirmDrain, setConfirmDrain] = useState<string | null>(null);
  const [editTable, setEditTable] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ smallBlind: '', bigBlind: '', minBuyIn: '', maxBuyIn: '' });
  const [editError, setEditError] = useState<string | null>(null);
  // Per-table "how many bots to add" selector (defaults to 3).
  const [botCounts, setBotCounts] = useState<Record<string, number>>({});
  const botCountFor = (tableId: string) => botCounts[tableId] ?? 3;

  if (state.tables.length === 0) {
    return (
      <Card variant="neutral" style={{ padding: 16 }}>
        No tables configured.
      </Card>
    );
  }

  const submitEdit = (tableId: string) => {
    const sb = Number.parseInt(editForm.smallBlind, 10);
    const bb = Number.parseInt(editForm.bigBlind, 10);
    const minBi = Number.parseInt(editForm.minBuyIn, 10);
    const maxBi = Number.parseInt(editForm.maxBuyIn, 10);
    if (![sb, bb, minBi, maxBi].every((n) => Number.isInteger(n) && n > 0) || bb !== sb * 2 || minBi > maxBi) {
      setEditError(
        'Positive integers; big blind = 2× small blind; min buy-in ≤ max buy-in.'
      );
      return;
    }
    socket.emit('editTableParams', {
      tableId,
      smallBlind: sb,
      bigBlind: bb,
      minBuyIn: minBi,
      maxBuyIn: maxBi,
    });
    setEditTable(null);
    setEditError(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {state.tables.map((t) => (
        <Card
          key={t.id}
          variant={t.status === 'enabled' ? 'active' : 'neutral'}
          style={{
            padding: '8px 12px',
            opacity: t.status === 'disabled' ? 0.65 : 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              minHeight: 52,
            }}
          >
            <span
              style={{ flex: '1 1 auto', color: 'white', fontSize: 14, fontWeight: 700 }}
            >
              {t.name}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-active)' }}>
              {t.playerCount} players
            </span>
            {t.botCount > 0 && (
              <span style={{ fontSize: 13, color: 'var(--color-neutral)' }}>
                {t.botCount} bots
              </span>
            )}
            <span style={{ fontSize: 13, color: 'var(--color-action-raise)' }}>
              {t.config.smallBlind}/{t.config.bigBlind}
            </span>
            <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            <Button
              variant="active"
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => socket.emit('enableTable', { tableId: t.id })}
            >
              Enable Table
            </Button>
            <Button
              variant="neutral"
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => socket.emit('disableTable', { tableId: t.id })}
            >
              Disable Table
            </Button>
            <Button
              variant="fold"
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => setConfirmDrain(t.id)}
            >
              Drain Table
            </Button>
            <Button
              variant="neutral"
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => {
                setEditTable(t.id);
                setEditForm({
                  smallBlind: String(t.config.smallBlind),
                  bigBlind: String(t.config.bigBlind),
                  minBuyIn: String(t.config.minBuyIn),
                  maxBuyIn: String(t.config.maxBuyIn),
                });
              }}
            >
              Edit Table
            </Button>

            {/* Playtest bots */}
            <select
              aria-label="Number of bots to add"
              value={botCountFor(t.id)}
              onChange={(e) => setBotCounts({ ...botCounts, [t.id]: Number.parseInt(e.target.value, 10) })}
              style={{ minHeight: 36, padding: '4px 8px', background: 'transparent', color: 'white', border: '1px solid var(--color-neutral)', borderRadius: 6 }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} style={{ color: 'black' }}>{n}</option>
              ))}
            </select>
            <Button
              variant="active"
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => socket.emit('addBots', { tableId: t.id, count: botCountFor(t.id) })}
            >
              Add Bots
            </Button>
            {t.botCount > 0 && (
              <Button
                variant="fold"
                style={{ minHeight: 36, padding: '4px 12px' }}
                onClick={() => socket.emit('removeBots', { tableId: t.id })}
              >
                Remove Bots
              </Button>
            )}
            <Button
              variant={t.botsContinue ? 'active' : 'neutral'}
              style={{ minHeight: 36, padding: '4px 12px' }}
              onClick={() => socket.emit('setBotsContinue', { tableId: t.id, enabled: !t.botsContinue })}
            >
              {t.botsContinue ? 'Bots: self-play ON' : 'Bots: self-play OFF'}
            </Button>
          </div>

          {confirmDrain === t.id && (
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
              <span style={{ flex: '1 1 auto' }}>
                Drain this table? Current hand will finish. No new seats after.
              </span>
              <Button
                variant="fold"
                emphasis
                style={{ minHeight: 36, padding: '4px 12px' }}
                onClick={() => {
                  socket.emit('drainTable', { tableId: t.id });
                  setConfirmDrain(null);
                }}
              >
                Confirm Drain
              </Button>
              <Button
                variant="neutral"
                style={{ minHeight: 36, padding: '4px 12px' }}
                onClick={() => setConfirmDrain(null)}
              >
                Keep Table
              </Button>
            </div>
          )}

          {editTable === t.id && (
            <div
              role="alert"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '8px 0',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ flex: 1, color: 'var(--color-neutral)' }}>
                  Small blind
                  <input
                    value={editForm.smallBlind}
                    onChange={(e) =>
                      setEditForm({ ...editForm, smallBlind: e.target.value })
                    }
                    style={{ display: 'block', width: '100%', height: 36, marginTop: 4 }}
                  />
                </label>
                <label style={{ flex: 1, color: 'var(--color-neutral)' }}>
                  Big blind
                  <input
                    value={editForm.bigBlind}
                    onChange={(e) =>
                      setEditForm({ ...editForm, bigBlind: e.target.value })
                    }
                    style={{ display: 'block', width: '100%', height: 36, marginTop: 4 }}
                  />
                </label>
                <label style={{ flex: 1, color: 'var(--color-neutral)' }}>
                  Min buy-in
                  <input
                    value={editForm.minBuyIn}
                    onChange={(e) =>
                      setEditForm({ ...editForm, minBuyIn: e.target.value })
                    }
                    style={{ display: 'block', width: '100%', height: 36, marginTop: 4 }}
                  />
                </label>
                <label style={{ flex: 1, color: 'var(--color-neutral)' }}>
                  Max buy-in
                  <input
                    value={editForm.maxBuyIn}
                    onChange={(e) =>
                      setEditForm({ ...editForm, maxBuyIn: e.target.value })
                    }
                    style={{ display: 'block', width: '100%', height: 36, marginTop: 4 }}
                  />
                </label>
              </div>
              {editError && (
                <div style={{ color: 'var(--color-action-fold)', fontSize: 13 }}>
                  {editError}
                </div>
              )}
              <div style={{ fontSize: 13, color: 'var(--color-neutral)' }}>
                Applied at next hand.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  variant="active"
                  style={{ minHeight: 36, padding: '4px 12px' }}
                  onClick={() => submitEdit(t.id)}
                >
                  Apply Next Hand
                </Button>
                <Button
                  variant="neutral"
                  style={{ minHeight: 36, padding: '4px 12px' }}
                  onClick={() => {
                    setEditTable(null);
                    setEditError(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};
