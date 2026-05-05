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
        onClaimBonus={vi.fn()}
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

  it('Deposit page renders "Coming Soon" copy (DEPOSIT-02)', () => {
    render(<Deposit onBack={vi.fn()} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('Deposit page Back button invokes onBack', () => {
    const onBack = vi.fn();
    render(<Deposit onBack={onBack} />);
    const back = screen.getByRole('button', { name: /back to menu/i });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
