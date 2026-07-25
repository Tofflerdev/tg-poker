import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MainMenu } from '../../pages/MainMenu';
import { Deposit } from '../../pages/Deposit';
import type { TelegramUser } from '../../../../types/index';

/**
 * Socket double that keeps the registered handlers so a test can push a server
 * event (e.g. `depositInfo` carrying a changed Crypto Pay fee) into the page.
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

const HERO: TelegramUser = {
  id: 'u1',
  telegramId: 12345,
  firstName: 'Hero',
  displayName: 'Hero',
  balance: 1000,
  avatarId: 'fox',
  tosAcceptedAt: new Date().toISOString(),
} as any as TelegramUser;

describe('Scenario: deposit navigation', () => {
  it('clicking the Deposit block on MainMenu navigates to deposit view', () => {
    const onNavigate = vi.fn();
    const socket = makeSocket();
    render(
      <MainMenu
        user={HERO}
        onNavigate={onNavigate}
        socket={socket as any}
        showGrandfatherBanner={false}
        onTosAccepted={vi.fn()}
      />
    );

    // Deposit block: div[role="button"][aria-label="Deposit — add chips"]
    // Use getByRole with exact label to avoid matching other elements
    const depositBlock = screen.getByRole('button', { name: /deposit — add chips/i });
    fireEvent.click(depositBlock);

    expect(onNavigate).toHaveBeenCalledWith('deposit');
  });

  it('Deposit page renders the amount picker and a Deposit button', () => {
    const socket = makeSocket();
    render(<Deposit onBack={vi.fn()} socket={socket as any} />);
    expect(screen.getByRole('button', { name: '$10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deposit \$10\.00/i })).toBeInTheDocument();
  });

  it('quotes the NET chips after the Crypto Pay fee, not the gross invoice', () => {
    const socket = makeSocket();
    render(<Deposit onBack={vi.fn()} socket={socket as any} />);
    // Default $10 invoice at the 3% fallback rate: pay $10.00, fee $0.30, get 970.
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText(/crypto pay fee \(3%\)/i)).toBeInTheDocument();
    expect(screen.getByText('−$0.30')).toBeInTheDocument();
    expect(screen.getByText(/^970 chips$/)).toBeInTheDocument();
    // The gross amount must NOT be presented as what the player receives.
    expect(screen.queryByText(/1[,\s]?000 chips/i)).not.toBeInTheDocument();
  });

  it('asks the server for the live fee and re-quotes when the rate changes', () => {
    const socket = makeSocket();
    render(<Deposit onBack={vi.fn()} socket={socket as any} />);
    expect(socket.emit).toHaveBeenCalledWith('getDepositInfo');

    // Crypto Pay moves to 5% → the quote follows without a code change.
    socket.__fire('depositInfo', { feeBps: 500, feeSource: 'observed', minChips: 500, available: true });
    expect(screen.getByText(/crypto pay fee \(5%\)/i)).toBeInTheDocument();
    expect(screen.getByText('−$0.50')).toBeInTheDocument();
    expect(screen.getByText(/^950 chips$/)).toBeInTheDocument();
  });

  it('Deposit button emits createDeposit with the selected chip amount', () => {
    const socket = makeSocket();
    render(<Deposit onBack={vi.fn()} socket={socket as any} />);
    // Pick $20 → 2000 chips, then deposit.
    fireEvent.click(screen.getByRole('button', { name: '$20' }));
    fireEvent.click(screen.getByRole('button', { name: /deposit \$20\.00/i }));
    expect(socket.emit).toHaveBeenCalledWith('createDeposit', { amountChips: 2000 });
  });

  it('Deposit page Back button invokes onBack', () => {
    const onBack = vi.fn();
    const socket = makeSocket();
    render(<Deposit onBack={onBack} socket={socket as any} />);
    const back = screen.getByRole('button', { name: /back to menu/i });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
