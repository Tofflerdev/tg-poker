import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Recharts ResponsiveContainer uses ResizeObserver — jsdom doesn't ship one.
beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

import { AdminEconomy } from '../AdminEconomy';
import type { AdminState } from '../../../../../types/index';

function makeState(overrides: Partial<AdminState> = {}): AdminState {
  return {
    tables: [],
    users: [],
    totalChipsInPlay: 0,
    recentAuditLogs: [],
    ...overrides,
  } as any as AdminState;
}

describe('AdminEconomy', () => {
  it('renders empty economy without crash; both StatCards show labels', () => {
    render(<AdminEconomy state={makeState()} />);
    expect(screen.getByText(/total chips in play/i)).toBeInTheDocument();
    expect(screen.getByText(/active players/i)).toBeInTheDocument();
    // Both stat values show "0" — at least one such element should be visible.
    expect(screen.getAllByText(/^0$/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders populated economy with correct values; recharts container does not throw', () => {
    // AdminEconomy.tsx renders "Active Players" as String(state.users.length)
    // and "Total Chips in Play" as state.totalChipsInPlay.toLocaleString()
    const users = [
      { telegramId: 'u1', displayName: 'P1', chips: 5000, tableId: 't-beg-1', seat: 0, bannedAt: null },
      { telegramId: 'u2', displayName: 'P2', chips: 3000, tableId: 't-std-1', seat: 1, bannedAt: null },
    ];
    const tables = [
      { id: 't-beg-1', name: 'Beginner 1', status: 'enabled' as const, playerCount: 1, botCount: 0, botsContinue: false, handInProgress: false, config: { smallBlind: 5, bigBlind: 10, buyIn: 500, maxPlayers: 6, turnTime: 30, category: 'cash' as const } },
      { id: 't-std-1', name: 'Standard 1', status: 'enabled' as const, playerCount: 1, botCount: 0, botsContinue: false, handInProgress: false, config: { smallBlind: 10, bigBlind: 20, buyIn: 1000, maxPlayers: 6, turnTime: 30, category: 'cash' as const } },
    ];
    render(
      <AdminEconomy
        state={makeState({ tables, users, totalChipsInPlay: 8000 })}
      />
    );
    // Stat labels render
    expect(screen.getByText(/total chips in play/i)).toBeInTheDocument();
    expect(screen.getByText(/active players/i)).toBeInTheDocument();
    // Active players = users.length = 2
    expect(screen.getByText('2')).toBeInTheDocument();
    // No throw is the main success criterion; render succeeded if we got here.
  });
});
