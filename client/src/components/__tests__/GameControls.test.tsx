import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import GameControls from '../GameControls';
import type { GameState, Player } from '../../../../types/index';

// NOTE: Tests assert on client-side emit semantics only.
// Server-side auth/turn-validation is covered by server/__tests__/*.test.ts.

function makeSocket() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'u1',
    displayName: 'Hero',
    chips: 1000,
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    acted: false,
    showCards: false,
    owesBlind: false,
    sittingOut: false,
    seat: 0,
    hand: [],
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
    seats: [makePlayer({ id: 'u1', displayName: 'Hero' }), null, null, null, null, null],
    nextHandIn: null,
    communityCards: [],
    pots: [],
    spectators: [],
    dealerPosition: 0,
    turnExpiresAt: null,
    lastRoundBets: [],
    ...overrides,
  } as any as GameState;
}

describe('GameControls', () => {
  it('clicking Fold emits "fold" with no args', () => {
    const socket = makeSocket();
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^fold$/i }));
    expect(socket.emit).toHaveBeenCalledWith('fold');
  });

  it('clicking Call emits "call" when toCall > 0', () => {
    const socket = makeSocket();
    const state = makeGameState({ currentBet: 40, seats: [makePlayer({ bet: 0 }), null, null, null, null, null] });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^call/i }));
    expect(socket.emit).toHaveBeenCalledWith('call');
  });

  it('clicking Check emits "check" when toCall === 0', () => {
    const socket = makeSocket();
    const state = makeGameState({ currentBet: 0, seats: [makePlayer({ bet: 0 }), null, null, null, null, null] });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^check/i }));
    expect(socket.emit).toHaveBeenCalledWith('check');
  });

  it('clicking Raise emits "raise" with the default raise amount (bigBlind floor)', () => {
    const socket = makeSocket();
    // Default raiseAmount state is 20; minRaise=bigBlind=20 → final = 20.
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /^raise/i }));
    expect(socket.emit).toHaveBeenCalledWith('raise', 20);
  });

  it('clicking + then Raise emits "raise" with bumped amount', () => {
    const socket = makeSocket();
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    // Desktop "+" button is rendered as "+" text with width:40.
    const plusBtn = screen.getByRole('button', { name: '+' });
    fireEvent.click(plusBtn);
    fireEvent.click(screen.getByRole('button', { name: /^raise/i }));
    expect(socket.emit).toHaveBeenCalledWith('raise', 40); // 20 + bigBlind 20
  });

  it('clicking All-In emits "allIn"', () => {
    const socket = makeSocket();
    render(<GameControls socket={socket as any} gameState={makeGameState()} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /all-in/i }));
    expect(socket.emit).toHaveBeenCalledWith('allIn');
  });

  it('renders "is thinking..." panel when it is not my turn (no action buttons)', () => {
    const socket = makeSocket();
    const state = makeGameState({
      currentPlayer: 1,
      seats: [makePlayer({ id: 'u1' }), makePlayer({ id: 'u2', displayName: 'Villain', seat: 1 }), null, null, null, null],
    });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^fold$/i })).not.toBeInTheDocument();
  });

  /* ── blind-debt phase 2: post now / wait for BB toggle ── */

  it('between hands with a blind debt: toggle renders, Wait emits setBlindMode("wait")', () => {
    const socket = makeSocket();
    const state = makeGameState({
      stage: 'waiting',
      currentPlayer: null,
      seats: [makePlayer({ owesBlind: true }), null, null, null, null, null],
    });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /wait for bb/i }));
    expect(socket.emit).toHaveBeenCalledWith('setBlindMode', 'wait');
  });

  it('a waiting player can switch back: Post emits setBlindMode("post")', () => {
    const socket = makeSocket();
    const state = makeGameState({
      stage: 'waiting',
      currentPlayer: null,
      seats: [makePlayer({ owesBlind: true, blindMode: 'wait', sittingOut: true }), null, null, null, null, null],
    });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    fireEvent.click(screen.getByRole('button', { name: /post bb/i }));
    expect(socket.emit).toHaveBeenCalledWith('setBlindMode', 'post');
  });

  it('mid-hand joiner (cardless, debt) sees the toggle on the not-my-turn panel', () => {
    const socket = makeSocket();
    const state = makeGameState({
      currentPlayer: 1,
      seats: [makePlayer({ owesBlind: true, hand: [] }), makePlayer({ id: 'u2', displayName: 'Villain', seat: 1 }), null, null, null, null],
    });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    expect(screen.getByRole('button', { name: /post bb/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wait for bb/i })).toBeInTheDocument();
  });

  it('no debt — no toggle', () => {
    const socket = makeSocket();
    const state = makeGameState({ stage: 'waiting', currentPlayer: null });
    render(<GameControls socket={socket as any} gameState={state} mySeat={0} />);
    expect(screen.queryByRole('button', { name: /post bb/i })).not.toBeInTheDocument();
  });
});
