import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProfileSettings } from '../../pages/ProfileSettings';
import type { TelegramUser, UserProfile } from '../../../../types/index';

function makeSocket() {
  const handlers = new Map<string, Set<(payload?: any) => void>>();
  return {
    on: vi.fn((event: string, cb: (payload?: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event: string, payload?: any) => {
      handlers.get(event)?.forEach(cb => cb(payload));
    },
  };
}

const HERO: TelegramUser = {
  id: 'u1',
  telegramId: 12345,
  firstName: 'Hero',
  displayName: 'Hero',
  avatarId: 'fox',
  balance: 1000,
} as TelegramUser;

const PROFILE: UserProfile = {
  telegramId: '12345',
  displayName: 'Hero',
  balance: 1000,
  avatarId: 'fox',
  handsPlayed: 0,
  handsWon: 0,
  totalWinnings: 0,
  biggestPot: 0,
} as any as UserProfile;

describe('Scenario: avatar selection', () => {
  it('switching avatar + Confirm emits updateAvatar with the chosen id', () => {
    const socket = makeSocket();
    render(
      <ProfileSettings socket={socket as any} onBack={vi.fn()} currentUser={HERO} />
    );

    // Trigger profileData so the component leaves loading state
    act(() => {
      socket._trigger('profileData', PROFILE);
    });

    // Switch to Avatar tab — TabBar renders buttons with label text
    fireEvent.click(screen.getByRole('button', { name: /^avatar$/i }));

    // Avatar tiles are role="radio" with aria-label="{slug}"
    // HERO has avatarId='fox'; pick 'wolf' to make dirty=true
    const wolfTile = screen.getByRole('radio', { name: 'wolf' });
    fireEvent.click(wolfTile);

    // Confirm button now shows "Confirm" (dirty=true) and is enabled
    const confirm = screen.getByRole('button', { name: /^confirm$/i });
    fireEvent.click(confirm);

    expect(socket.emit).toHaveBeenCalledWith('updateAvatar', { avatarId: 'wolf' });
  });

  it('Confirm is disabled when no avatar change is pending', () => {
    const socket = makeSocket();
    render(
      <ProfileSettings socket={socket as any} onBack={vi.fn()} currentUser={HERO} />
    );

    act(() => {
      socket._trigger('profileData', PROFILE);
    });

    fireEvent.click(screen.getByRole('button', { name: /^avatar$/i }));

    // When dirty=false, the button text is "No changes" and it is disabled
    const noChangesBtn = screen.getByRole('button', { name: /no changes/i }) as HTMLButtonElement;
    expect(noChangesBtn.disabled).toBe(true);
  });

  it('selecting the already-current avatar keeps Confirm disabled', () => {
    const socket = makeSocket();
    render(
      <ProfileSettings socket={socket as any} onBack={vi.fn()} currentUser={HERO} />
    );

    act(() => {
      socket._trigger('profileData', PROFILE);
    });

    fireEvent.click(screen.getByRole('button', { name: /^avatar$/i }));

    // Click the fox tile — same as currentUser.avatarId, dirty stays false
    const foxTile = screen.getByRole('radio', { name: 'fox' });
    fireEvent.click(foxTile);

    // Button label is still "No changes" and still disabled
    const noChangesBtn = screen.getByRole('button', { name: /no changes/i }) as HTMLButtonElement;
    expect(noChangesBtn.disabled).toBe(true);
  });
});
