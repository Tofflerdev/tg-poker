import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MainMenu } from '../../pages/MainMenu';
import { Deposit } from '../../pages/Deposit';
import type { TelegramUser } from '../../../../types/index';

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
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
    // Preset amount buttons and the default $10 → 1000 chips readout.
    expect(screen.getByRole('button', { name: '$10' })).toBeInTheDocument();
    // toLocaleString grouping depends on the runtime's ICU data — tolerate "1,000"/"1000".
    expect(screen.getByText(/1[,\s]?000 chips/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deposit \$10\.00/i })).toBeInTheDocument();
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
