import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminAudit } from '../AdminAudit';
import type { AdminState, AdminAuditLogEntry } from '../../../../../types/index';

function makeEntry(overrides: Partial<AdminAuditLogEntry> = {}): AdminAuditLogEntry {
  return {
    id: 'a1',
    adminTelegramId: '999',
    action: 'kick',
    targetType: 'user',
    targetId: '12345',
    beforeJson: null,
    afterJson: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as AdminAuditLogEntry;
}

function makeState(log: AdminAuditLogEntry[]): AdminState {
  return {
    tables: [],
    users: [],
    totalChipsInPlay: 0,
    recentAuditLogs: log,
  } as any as AdminState;
}

describe('AdminAudit', () => {
  it('renders without crash on empty audit log', () => {
    const { container } = render(<AdminAudit state={makeState([])} />);
    expect(container).toBeTruthy();
    expect(screen.getByText(/no admin actions recorded yet/i)).toBeInTheDocument();
  });

  it('renders the action label for a kick entry', () => {
    render(<AdminAudit state={makeState([makeEntry({ action: 'kick' })])} />);
    // ACTION_LABEL.kick = 'Kicked' per AdminAudit.tsx source
    expect(screen.getByText(/kicked/i)).toBeInTheDocument();
  });

  it('renders multiple entries with correct action labels', () => {
    const entries = [
      makeEntry({ id: '1', action: 'kick' }),
      makeEntry({ id: '2', action: 'ban' }),
      makeEntry({ id: '3', action: 'grantBalance' }),
    ];
    render(<AdminAudit state={makeState(entries)} />);
    expect(screen.getByText(/kicked/i)).toBeInTheDocument();
    expect(screen.getByText(/banned/i)).toBeInTheDocument();
    expect(screen.getByText(/balance grant/i)).toBeInTheDocument();
  });
});
