import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    bankrollBalance: 0,
    houseBalance: 0,
    ...overrides,
  } as any as AdminState;
}

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as any;
}

describe('AdminEconomy', () => {
  it('renders empty economy without crash; both StatCards show labels', () => {
    render(<AdminEconomy state={makeState()} socket={makeSocket()} />);
    expect(screen.getByText(/total chips in play/i)).toBeInTheDocument();
    expect(screen.getByText(/active players/i)).toBeInTheDocument();
    // Both stat values show "0" — at least one such element should be visible.
    expect(screen.getAllByText(/^0$/).length).toBeGreaterThanOrEqual(1);
  });

  it('§K: top-up button emits topUpBankroll with the entered chip amount', () => {
    const socket = makeSocket();
    render(<AdminEconomy state={makeState()} socket={socket} />);
    const input = screen.getByLabelText(/bankroll top-up amount in chips/i);
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /top up bot bankroll/i }));
    expect(socket.emit).toHaveBeenCalledWith('topUpBankroll', { amountChips: 5000 });
  });

  it('§K: shows the current bankroll balance from state', () => {
    render(<AdminEconomy state={makeState({ bankrollBalance: 25000 })} socket={makeSocket()} />);
    // toLocaleString grouping depends on the runtime's ICU data — tolerate "25,000"/"25000".
    expect(screen.getByText(/25[,\s]?000 chips/i)).toBeInTheDocument();
    expect(screen.getByText(/\$250\.00/)).toBeInTheDocument();
  });

  it('§H: shows the house rake balance from state', () => {
    render(<AdminEconomy state={makeState({ houseBalance: 5000 })} socket={makeSocket()} />);
    expect(screen.getByText(/5[,\s]?000 chips/i)).toBeInTheDocument();
    expect(screen.getByText(/\$50\.00/)).toBeInTheDocument();
  });

  it('§H: withdraw emits withdrawHouseRake with amount + target user id', () => {
    const socket = makeSocket();
    render(<AdminEconomy state={makeState({ houseBalance: 5000 })} socket={socket} />);
    fireEvent.change(screen.getByLabelText(/house withdrawal amount in chips/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/withdrawal recipient telegram user id/i), { target: { value: '424242' } });
    fireEvent.click(screen.getByRole('button', { name: /withdraw house rake/i }));
    expect(socket.emit).toHaveBeenCalledWith('withdrawHouseRake', { amountChips: 2000, targetUserId: 424242 });
  });

  it('renders populated economy with correct values; recharts container does not throw', () => {
    // AdminEconomy.tsx renders "Active Players" as String(state.users.length)
    // and "Total Chips in Play" as state.totalChipsInPlay.toLocaleString()
    const users = [
      { telegramId: 'u1', displayName: 'P1', chips: 5000, tableId: 't-beg-1', seat: 0, bannedAt: null },
      { telegramId: 'u2', displayName: 'P2', chips: 3000, tableId: 't-std-1', seat: 1, bannedAt: null },
    ];
    const tables = [
      { id: 't-beg-1', name: 'Beginner 1', status: 'enabled' as const, playerCount: 1, botCount: 0, botsContinue: false, handInProgress: false, config: { smallBlind: 5, bigBlind: 10, minBuyIn: 400, maxBuyIn: 1000, maxPlayers: 6, turnTime: 30, category: 'cash' as const, rakeBps: 500, rakeCapBB: 4 } },
      { id: 't-std-1', name: 'Standard 1', status: 'enabled' as const, playerCount: 1, botCount: 0, botsContinue: false, handInProgress: false, config: { smallBlind: 10, bigBlind: 20, minBuyIn: 800, maxBuyIn: 2000, maxPlayers: 6, turnTime: 30, category: 'cash' as const, rakeBps: 500, rakeCapBB: 4 } },
    ];
    render(
      <AdminEconomy
        state={makeState({ tables, users, totalChipsInPlay: 8000 })}
        socket={makeSocket()}
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
