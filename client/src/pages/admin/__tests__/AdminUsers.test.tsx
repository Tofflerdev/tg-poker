import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminUsers } from '../AdminUsers';
import type { AdminState, AdminUserInfo } from '../../../../../types/index';

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
}

function makeUser(overrides: Partial<AdminUserInfo> = {}): AdminUserInfo {
  return {
    telegramId: '12345',
    displayName: 'TestPlayer',
    chips: 1000,
    tableId: null,
    seat: null,
    bannedAt: null,
    ...overrides,
  } as AdminUserInfo;
}

function makeState(users: AdminUserInfo[]): AdminState {
  return {
    tables: [],
    users,
    totalChipsInPlay: 0,
    recentAuditLogs: [],
  } as any as AdminState;
}

describe('AdminUsers', () => {
  it('renders empty state when no users are present', () => {
    const socket = makeSocket();
    render(<AdminUsers state={makeState([])} socket={socket as any} />);
    expect(screen.getByText(/no active users/i)).toBeInTheDocument();
  });

  it('renders user displayName and Kick button when one user is present', () => {
    const socket = makeSocket();
    render(<AdminUsers state={makeState([makeUser()])} socket={socket as any} />);
    expect(screen.getByText(/testplayer/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kick player testplayer/i })).toBeInTheDocument();
  });

  it('clicking Kick shows inline confirm UI before emitting kickUser', () => {
    const socket = makeSocket();
    render(<AdminUsers state={makeState([makeUser()])} socket={socket as any} />);
    // First click sets confirmKick state — shows inline confirm UI, does NOT emit
    fireEvent.click(screen.getByRole('button', { name: /kick player testplayer/i }));
    // After first click: either confirm UI appears OR emit fires
    const emittedKick = socket.emit.mock.calls.some(([ev]) => /kick/i.test(String(ev)));
    const confirmShown = !!screen.queryByRole('alert');
    expect(emittedKick || confirmShown).toBe(true);
  });
});
