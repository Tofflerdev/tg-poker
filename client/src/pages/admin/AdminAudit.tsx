import React from 'react';
import { Card } from '../../components/ui';
import type { AdminState, AdminAuditLogEntry } from '../../../../types/index';

/**
 * Phase 5 / Plan 05-05 / ADMIN-03 / AdminAudit.
 *
 * Audit Log tab — renders the last 10 AdminAuditLogEntry rows received in the
 * adminState snapshot, color-coded by action type per UI-SPEC.
 */

interface Props {
  state: AdminState;
}

const ACTION_COLOR: Record<string, string> = {
  kick: 'var(--color-action-fold)',
  ban: 'var(--color-action-fold)',
  grantBalance: 'var(--color-action-sit)',
  enableTable: 'var(--color-action-raise)',
  disableTable: 'var(--color-action-raise)',
  drainTable: 'var(--color-action-raise)',
  editTableParams: 'var(--color-active)',
};

const ACTION_LABEL: Record<string, string> = {
  kick: 'Kicked',
  ban: 'Banned',
  grantBalance: 'Balance Grant',
  enableTable: 'Enabled',
  disableTable: 'Disabled',
  drainTable: 'Drained',
  editTableParams: 'Parameters Edited',
};

export const AdminAudit: React.FC<Props> = ({ state }) => {
  if (state.recentAuditLogs.length === 0) {
    return (
      <Card variant="neutral" style={{ padding: 16 }}>
        No admin actions recorded yet.
      </Card>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'white',
          margin: '0 0 8px',
        }}
      >
        Last 10 Actions
      </h2>
      {state.recentAuditLogs.map((row: AdminAuditLogEntry) => (
        <Card key={row.id} variant="neutral" style={{ padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: ACTION_COLOR[row.action] ?? 'var(--color-neutral)',
                minWidth: 140,
              }}
            >
              {ACTION_LABEL[row.action] ?? row.action}
            </span>
            <span
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: 13,
                color: 'var(--color-neutral)',
                opacity: 0.7,
              }}
            >
              {row.targetType}:{row.targetId}
              {row.beforeJson
                ? ` → ${JSON.stringify(row.afterJson ?? '')}`
                : ''}
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: 'var(--color-neutral)',
                opacity: 0.6,
              }}
            >
              {row.adminTelegramId} · {new Date(row.createdAt).toLocaleString()}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
};
