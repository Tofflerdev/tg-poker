import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  // exit-reconnect B10: seats are auto-assigned by design. An empty seat is scenery,
  // never an invitation — it used to be a clickable "+ / Sit" tile, which is how a
  // busted player picked their own seat and re-bought at minBuyIn on whatever table
  // was free first. Sitting down is the buy-in picker, always with seat -1.
  it('renders empty seats as inert scenery — no click handler, no Sit affordance', () => {
    const seats = [null, null, null, null, null, null];
    const { container } = render(
      <SeatsDisplay seats={seats as any} mySeat={null} tableWidth={600} tableHeight={400} />
    );
    const tiles = container.querySelectorAll('div.absolute');
    expect(tiles.length).toBe(6);
    expect(screen.queryByText('Sit')).not.toBeInTheDocument();
    expect(screen.queryByText('+')).not.toBeInTheDocument();
    // Inert: hidden from the accessibility tree and not pointer-interactive.
    tiles.forEach((tile) => {
      expect(tile.getAttribute('aria-hidden')).toBe('true');
      expect((tile.firstElementChild as HTMLElement).style.cursor).not.toBe('pointer');
    });
  });

  it('renders six absolutely-positioned seat tiles (smoke)', () => {
    const { container } = render(
      <SeatsDisplay
        seats={[null, null, null, null, null, null] as any}
        mySeat={null}
        tableWidth={600}
        tableHeight={400}
      />
    );
    expect(container.querySelectorAll('div.absolute').length).toBe(6);
  });
});
