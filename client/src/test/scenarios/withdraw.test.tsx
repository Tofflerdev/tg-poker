import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Withdraw } from '../../pages/Withdraw';

/**
 * crypto-payments-rake phase 5 §I — the player-facing payout screen.
 *
 * Limits come from the server (`withdrawalInfo`); the screen must never invent
 * them, and must not let a request through that policy would reject.
 */
function makeSocket() {
  const handlers: Record<string, Function[]> = {};
  return {
    on: vi.fn((event: string, fn: Function) => {
      (handlers[event] ??= []).push(fn);
    }),
    off: vi.fn((event: string, fn: Function) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== fn);
    }),
    emit: vi.fn(),
    __fire(event: string, payload?: unknown) {
      act(() => {
        (handlers[event] ?? []).forEach((h) => h(payload));
      });
    },
  };
}

const INFO = {
  available: true,
  balanceChips: 9500,
  minChips: 1000,
  maxAvailableChips: 9500,
  remainingDailyChips: 50_000,
  handsSinceDeposit: 120,
  requiredHands: 0,
  blockedBy: null,
};

describe('Scenario: withdrawal', () => {
  it('asks the server for limits on mount', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    expect(socket.emit).toHaveBeenCalledWith('getWithdrawalInfo');
    expect(socket.emit).toHaveBeenCalledWith('getWithdrawalHistory');
  });

  it('shows the balance and what is actually withdrawable', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', { ...INFO, maxAvailableChips: 5000 });

    expect(screen.getByText(/available to withdraw/i)).toBeInTheDocument();
    expect(screen.getByText(/5[,\s]?000 chips/)).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('submits a request for the entered amount', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', INFO);

    fireEvent.change(screen.getByLabelText(/withdrawal amount in chips/i), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /withdraw \$20\.00/i }));

    expect(socket.emit).toHaveBeenCalledWith('requestWithdrawal', { amountChips: 2000 });
  });

  it('does not let an amount below the minimum be submitted', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', INFO);

    fireEvent.change(screen.getByLabelText(/withdrawal amount in chips/i), { target: { value: '500' } });
    const submit = screen.getByRole('button', { name: /^withdraw \$5\.00$/i });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);

    expect(socket.emit).not.toHaveBeenCalledWith('requestWithdrawal', expect.anything());
  });

  it('explains the activity threshold instead of a dead button', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', {
      ...INFO,
      blockedBy: 'NOT_ENOUGH_HANDS',
      handsSinceDeposit: 12,
      requiredHands: 50,
      maxAvailableChips: 0,
    });

    expect(screen.getByText(/play 38 more hands before withdrawing/i)).toBeInTheDocument();
  });

  it('confirms the chips are held once the request is accepted', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', INFO);
    socket.__fire('withdrawalRequested', { spendId: 'wd-1', amountChips: 2000, balance: 7500 });

    expect(screen.getByText(/2[,\s]?000 chips held/i)).toBeInTheDocument();
  });

  it('tells the player when an admin settles the request', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', INFO);

    socket.__fire('withdrawalUpdated', { spendId: 'wd-1', status: 'completed', amountChips: 2000, balance: 7500 });
    expect(screen.getByText(/paid out/i)).toBeInTheDocument();

    socket.__fire('withdrawalUpdated', { spendId: 'wd-2', status: 'failed', amountChips: 2000, balance: 9500 });
    expect(screen.getByText(/back on your balance/i)).toBeInTheDocument();
  });

  it('surfaces a server-side rejection', () => {
    const socket = makeSocket();
    render(<Withdraw onBack={vi.fn()} socket={socket as any} />);
    socket.__fire('withdrawalInfo', INFO);
    socket.__fire('withdrawalError', 'Daily limit reached — 0 chips left for today.');

    expect(screen.getByText(/daily limit reached/i)).toBeInTheDocument();
  });
});
