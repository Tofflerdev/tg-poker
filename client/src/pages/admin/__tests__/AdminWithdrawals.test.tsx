import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminWithdrawals } from '../AdminWithdrawals';
import type { AdminState, AdminWithdrawalRequest } from '../../../../../types/index';

/**
 * crypto-payments-rake phase 5 §I — the payout approval queue.
 * Flags must be visible but never block the buttons (no autobans by design).
 */
function makeState(pendingWithdrawals: AdminWithdrawalRequest[] = []): AdminState {
  return {
    tables: [],
    users: [],
    totalChipsInPlay: 0,
    recentAuditLogs: [],
    bankrollBalance: 0,
    houseBalance: 0,
    depositFeeBps: 300,
    pendingWithdrawals,
  } as any as AdminState;
}

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() } as any;
}

const REQUEST: AdminWithdrawalRequest = {
  spendId: 'wd-158394554-abc',
  telegramId: 158394554,
  displayName: 'Fair Hawk 49',
  amountChips: 5000,
  createdAt: new Date('2026-07-25T10:00:00Z').toISOString(),
  flags: [],
  handsSinceDeposit: 120,
  totalDepositedChips: 9700,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AdminWithdrawals', () => {
  it('shows an empty queue without crashing', () => {
    render(<AdminWithdrawals state={makeState()} socket={makeSocket()} />);
    expect(screen.getByText(/no withdrawal requests waiting/i)).toBeInTheDocument();
  });

  it('lists a request with its amount and context', () => {
    render(<AdminWithdrawals state={makeState([REQUEST])} socket={makeSocket()} />);
    expect(screen.getByText('Fair Hawk 49')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText(/120 hands since deposit/i)).toBeInTheDocument();
  });

  it('approves only after an explicit confirmation', () => {
    const socket = makeSocket();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AdminWithdrawals state={makeState([REQUEST])} socket={socket} />);

    fireEvent.click(screen.getByRole('button', { name: /approve withdrawal/i }));
    expect(socket.emit).not.toHaveBeenCalled(); // declined the confirm

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /approve withdrawal/i }));
    expect(socket.emit).toHaveBeenCalledWith('approveWithdrawal', { spendId: REQUEST.spendId });
  });

  it('sends the rejection reason along', () => {
    const socket = makeSocket();
    vi.spyOn(window, 'prompt').mockReturnValue('suspected transit');
    render(<AdminWithdrawals state={makeState([REQUEST])} socket={socket} />);

    fireEvent.click(screen.getByRole('button', { name: /reject withdrawal/i }));
    expect(socket.emit).toHaveBeenCalledWith('rejectWithdrawal', {
      spendId: REQUEST.spendId,
      reason: 'suspected transit',
    });
  });

  it('renders §I flags without disabling the decision buttons', () => {
    const flagged = { ...REQUEST, flags: ['POSSIBLE_TRANSIT', 'NO_HANDS_SINCE_DEPOSIT'], handsSinceDeposit: 0 };
    render(<AdminWithdrawals state={makeState([flagged])} socket={makeSocket()} />);

    expect(screen.getByText(/possible transit/i)).toBeInTheDocument();
    expect(screen.getByText(/no hands since deposit/i)).toBeInTheDocument();
    // Advisory only — a human still decides.
    expect(screen.getByRole('button', { name: /approve withdrawal/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /reject withdrawal/i })).toBeEnabled();
  });

  it('totals the queue', () => {
    const second = { ...REQUEST, spendId: 'wd-2', amountChips: 1500 };
    render(<AdminWithdrawals state={makeState([REQUEST, second])} socket={makeSocket()} />);
    expect(screen.getByText(/2 · \$65\.00/)).toBeInTheDocument();
  });
});
