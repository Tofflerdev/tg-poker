import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameControls from '../../components/GameControls';
import type { GameState, Player } from '../../../../types/index';

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'u1',
    displayName: 'Hero',
    chips: 1000,
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
    currentBet: 40,
    totalPot: 100,
    bigBlind: 20,
    smallBlind: 10,
    seats: [makePlayer(), null, null, null, null, null],
    nextHandIn: null,
    communityCards: [],
    pots: [],
    spectators: [],
    ...overrides,
  } as any as GameState;
}

describe('Scenario: fold/call/raise', () => {
  it('Fold → socket.emit("fold")', () => {
    const socket = makeSocket();
    // Desktop layout (matchMedia returns matches:false from setup.ts)
    // mySeat=0, currentPlayer=0 → isMyTurn=true → action buttons render
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^fold$/i }));
    expect(socket.emit).toHaveBeenCalledWith('fold');
  });

  it('Call (toCall>0) → socket.emit("call")', () => {
    const socket = makeSocket();
    // currentBet=40, myPlayer.bet=0 → toCall=40 > 0 → button text = "Call"
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^call/i }));
    expect(socket.emit).toHaveBeenCalledWith('call');
  });

  it('Raise → socket.emit("raise", amount)', () => {
    const socket = makeSocket();
    // Desktop: Raise button directly emits ("raise", raiseAmount)
    // raiseAmount initializes to 20 (bigBlind=20, Math.max(20,20)=20)
    // The desktop Raise button has two child spans ("Raise" + the amount), so
    // its accessible name is "Raise 20". Use a partial regex.
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^raise/i }));
    expect(socket.emit).toHaveBeenCalledWith('raise', 20);
  });
});
