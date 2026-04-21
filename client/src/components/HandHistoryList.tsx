import React, { useState } from 'react';
import type { Socket } from 'socket.io-client';
import { Card } from './ui';
import { HandHistoryRow } from './HandHistoryRow';
import { useHandHistory } from '../hooks/useHandHistory';

/**
 * Phase 3 / Plan 03-05 (PROFILE-03) — Profile → History tab content.
 *
 * Owns:
 * - The useHandHistory subscription (driven by `active` from the parent so the
 *   hook is silent until the tab is selected).
 * - Loading / empty / error / data UI states per UI-SPEC §HandHistoryList.
 * - Single-row expansion state (UI-SPEC §HandHistoryRow expand/collapse —
 *   only one row can be expanded at a time).
 *
 * SECURITY (T-3-XSS-CLIENT): all text is rendered as React text children, never
 * via raw HTML injection. The downstream HandHistoryRow honors the same rule
 * plus a defense-in-depth privacy gate on opponent cards.
 */

export interface HandHistoryListProps {
  socket: Socket;
  active: boolean;
}

export const HandHistoryList: React.FC<HandHistoryListProps> = ({ socket, active }) => {
  const { rows, loading, error } = useHandHistory(socket, active);
  const [expandedHandId, setExpandedHandId] = useState<string | null>(null);

  // Single-row expansion contract: tapping a new row collapses the previous
  // (UI-SPEC §HandHistoryRow expand/collapse). Tapping the open row toggles it
  // closed.
  const handleToggle = (handId: string) => {
    setExpandedHandId((prev) => (prev === handId ? null : handId));
  };

  if (loading) {
    return (
      <Card variant="neutral" padding={20}>
        <div
          style={{
            color: 'var(--color-neutral)',
            fontSize: 13,
            fontWeight: 400,
            textAlign: 'center',
          }}
        >
          Loading hand history...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="fold" padding={20} glow>
        <div
          style={{
            color: 'var(--color-action-fold)',
            fontSize: 13,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div>Could not load hand history.</div>
          <div>Try closing and reopening your profile.</div>
        </div>
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card variant="neutral" padding={28} glow>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: '1.5px dashed color-mix(in srgb, var(--color-neutral) 50%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: 'var(--color-neutral)',
              textShadow: '0 0 8px var(--glow-neutral)',
            }}
            aria-hidden
          >
            ♠
          </div>
          <div
            style={{
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            No hands yet
          </div>
          <div
            style={{
              color: 'var(--color-neutral)',
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: 280,
            }}
          >
            Your played hands will appear here.
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div
      role="list"
      aria-label="Hand history"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {rows.map((r) => (
        <HandHistoryRow
          key={r.handId}
          row={r}
          expanded={expandedHandId === r.handId}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
};
