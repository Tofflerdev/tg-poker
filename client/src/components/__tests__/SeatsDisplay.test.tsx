import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';
import SeatsDisplay from '../SeatsDisplay';
import type { Player } from '../../../../types/index';

// Motion passthrough — copy of ReconnectOverlay.test.tsx pattern. Empty seats
// don't render motion components, but occupied-seat tests render HandDisplay
// which may transitively use motion in future. Defensive mock.
vi.mock('motion/react', async () => {
  const ReactMod = await import('react');
  const passthrough = (tag: string) =>
    ReactMod.forwardRef<HTMLElement, any>((props, ref) => {
      const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, ...rest } = props;
      return ReactMod.createElement(tag, { ...rest, ref });
    });
  const motion: any = new Proxy({}, { get: (_t, tag: string) => passthrough(tag) });
  return {
    motion,
    AnimatePresence: ({ children }: any) => ReactMod.createElement(ReactMod.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'u-occupied',
    displayName: 'Villain',
    chips: 800,
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    acted: false,
    showCards: false,
    waitingForBB: false,
    sittingOut: false,
    seat: 0,
    hand: [],
    avatarId: 'fox',
    ...overrides,
  } as Player;
}

describe('SeatsDisplay', () => {
  it('clicking an empty seat fires onSit with the seat index (D-04)', () => {
    const onSit = vi.fn();
    const seats = [null, null, null, null, null, null];
    const { container } = render(
      <SeatsDisplay
        seats={seats as any}
        mySeat={null}
        tableWidth={600}
        tableHeight={400}
        onSit={onSit}
      />
    );
    const tiles = container.querySelectorAll('div.absolute');
    expect(tiles.length).toBe(6);
    fireEvent.click(tiles[2]);
    expect(onSit).toHaveBeenCalledTimes(1);
    expect(onSit).toHaveBeenCalledWith(2);
  });

  it('clicking an occupied seat does NOT fire onSit', () => {
    const onSit = vi.fn();
    const seats = [null, null, makePlayer({ id: 'occupant', seat: 2 }), null, null, null];
    const { container } = render(
      <SeatsDisplay
        seats={seats as any}
        mySeat={null}
        tableWidth={600}
        tableHeight={400}
        onSit={onSit}
      />
    );
    const tiles = container.querySelectorAll('div.absolute');
    fireEvent.click(tiles[2]); // The occupied seat at index 2
    expect(onSit).not.toHaveBeenCalled();
  });

  it('clicking any seat when mySeat is already set does NOT fire onSit', () => {
    const onSit = vi.fn();
    // mySeat=0 → canSit is false for all empty seats per component logic.
    const seats = [makePlayer({ id: 'me', seat: 0 }), null, null, null, null, null];
    const { container } = render(
      <SeatsDisplay
        seats={seats as any}
        mySeat={0}
        tableWidth={600}
        tableHeight={400}
        onSit={onSit}
      />
    );
    const tiles = container.querySelectorAll('div.absolute');
    fireEvent.click(tiles[3]); // An empty seat
    expect(onSit).not.toHaveBeenCalled();
  });

  it('renders six absolutely-positioned seat tiles (smoke)', () => {
    const { container } = render(
      <SeatsDisplay
        seats={[null, null, null, null, null, null] as any}
        mySeat={null}
        tableWidth={600}
        tableHeight={400}
        onSit={vi.fn()}
      />
    );
    expect(container.querySelectorAll('div.absolute').length).toBe(6);
  });
});
