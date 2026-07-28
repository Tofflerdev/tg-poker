import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GameRoom } from '../../pages/GameRoom';
import type { GameState, Player } from '../../../../types/index';

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn(), id: 'sock1' };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'u1',
    displayName: 'Hero',
    chips: 2400,
    bet: 0,
    folded: false,
    allIn: false,
    seat: 0,
    hand: [],
    totalBet: 0,
    acted: false,
    showCards: false,
    sittingOut: false,
    owesBlind: false,
    ...overrides,
  } as Player;
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    stage: 'flop',
    currentPlayer: 0,
    currentBet: 0,
    totalPot: 0,
    bigBlind: 20,
    smallBlind: 10,
    seats: [makePlayer(), null, null, null, null, null],
    nextHandIn: null,
    communityCards: [],
    pots: [],
    spectators: [],
    dealerPosition: 0,
    ...overrides,
  } as any as GameState;
}

function renderRoom(gameState: GameState = makeGameState(), mySeat: number | null = 0) {
  const onLeaveTable = vi.fn();
  const utils = render(
    <GameRoom
      socket={makeSocket() as any}
      tableId="t1"
      gameState={gameState}
      currentUser={null}
      mySeat={mySeat}
      showdown={null}
      onLeaveTable={onLeaveTable}
    />
  );
  return { ...utils, onLeaveTable };
}

/**
 * The leave flow used to go through Telegram's `showConfirm` system dialog.
 * These cover the replacement wiring: our own sheet opens, and nothing leaves
 * the table until the player confirms in it.
 */
describe('Scenario: leaving a table', () => {
  it('back chrome button opens the sheet instead of leaving outright', () => {
    const { onLeaveTable } = renderRoom();
    expect(screen.queryByTestId('leave-table-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.getByTestId('leave-table-modal')).toBeInTheDocument();
    expect(onLeaveTable).not.toHaveBeenCalled();
  });

  it('does not fall back to the Telegram system confirm', () => {
    renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));
    expect(window.Telegram!.WebApp.showConfirm).not.toHaveBeenCalled();
  });

  it('confirming in the sheet leaves the table and closes the sheet', () => {
    const { onLeaveTable } = renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /leave table/i }));

    expect(onLeaveTable).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('leave-table-modal')).not.toBeInTheDocument();
  });

  it('"Stay" closes the sheet and keeps the seat', () => {
    const { onLeaveTable } = renderRoom();
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /^stay$/i }));

    expect(onLeaveTable).not.toHaveBeenCalled();
    expect(screen.queryByTestId('leave-table-modal')).not.toBeInTheDocument();
  });

  it('quotes my own stack, not another seat', () => {
    const state = makeGameState({
      seats: [makePlayer({ chips: 999 }), null, makePlayer({ id: 'u2', seat: 2, chips: 2400 }), null, null, null],
    });
    renderRoom(state, 0);
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.getByText('$9.99')).toBeInTheDocument();
  });

  it('a folded player is not warned about a live hand', () => {
    renderRoom(makeGameState({ seats: [makePlayer({ folded: true }), null, null, null, null, null] }), 0);
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.queryByText(/current hand will be folded/i)).not.toBeInTheDocument();
  });

  it('warns a live player mid-hand that the hand will be folded', () => {
    renderRoom(makeGameState({ stage: 'turn' }), 0);
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.getByText(/current hand will be folded/i)).toBeInTheDocument();
  });

  it('between hands there is no fold warning', () => {
    renderRoom(makeGameState({ stage: 'waiting', currentPlayer: null }), 0);
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.getByText(/seat will be freed/i)).toBeInTheDocument();
  });

  it('a spectator sees no stack readout', () => {
    renderRoom(makeGameState({ seats: [null, null, null, null, null, null] }), null);
    fireEvent.click(screen.getByRole('button', { name: /back to menu/i }));

    expect(screen.getByTestId('leave-table-modal')).toBeInTheDocument();
    expect(screen.queryByText(/returned to your balance/i)).not.toBeInTheDocument();
  });
});
