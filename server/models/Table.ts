import type { TableConfig, TableStatus, GameState } from '../../types/index.js';
import Game from '../Game.js';

/**
 * Table model representing a poker table
 * Wraps a Game instance and manages table-level state
 */
export class Table {
  id: string;
  name: string;
  config: TableConfig;
  game: Game;
  playerIds: Set<string>; // socketIds of players at this table
  status: TableStatus;
  createdAt: Date;

  constructor(id: string, name: string, config: TableConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.game = new Game();
    this.playerIds = new Set();
    this.status = 'waiting';
    this.createdAt = new Date();

    // Configure the game with table settings (via config methods if available)
    // Note: Game class has hardcoded blinds, we'll work with defaults for now
    
    // Setup state change callback
    this.game.setOnStateChange(() => {
      this.updateStatus();
    });

    // Setup turn timeout callback
    this.game.setOnTurnTimeout(() => {
      // Auto-fold on timeout
      const state = this.game.getState();
      if (state.currentPlayer !== null) {
        const player = state.seats[state.currentPlayer];
        if (player) {
          this.game.fold(player.id);
        }
      }
    });
  }

  /**
   * Get current player count
   */
  get playerCount(): number {
    return this.playerIds.size;
  }

  /**
   * Update table status based on game state
   */
  private updateStatus(): void {
    const state = this.game.getState();
    const activePlayers = state.seats.filter(p => p !== null).length;
    
    if (activePlayers >= this.config.maxPlayers) {
      this.status = 'full';
    } else if (state.stage !== 'waiting') {
      this.status = 'playing';
    } else {
      this.status = 'waiting';
    }
  }

  /**
   * Check if a seat is available
   */
  isSeatAvailable(seat: number): boolean {
    const state = this.game.getState();
    return seat >= 0 && seat < this.config.maxPlayers && state.seats[seat] === null;
  }

  /**
   * Find the first available seat
   * Returns seat number or -1 if no seats available
   */
  findFirstAvailableSeat(): number {
    const state = this.game.getState();
    for (let i = 0; i < this.config.maxPlayers; i++) {
      if (state.seats[i] === null) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Add a player to the table
   */
  addPlayer(socketId: string, seat: number): boolean {
    if (!this.isSeatAvailable(seat)) {
      return false;
    }

    const success = this.game.addPlayer(socketId, seat);
    if (success) {
      this.playerIds.add(socketId);
      this.updateStatus();
    }
    return success;
  }

  /**
   * Remove a player from the table
   */
  removePlayer(socketId: string): void {
    this.game.removePlayer(socketId);
    this.playerIds.delete(socketId);
    this.updateStatus();
  }

  /**
   * Add a spectator to the table
   */
  addSpectator(socketId: string): void {
    this.game.addSpectator(socketId);
  }

  /**
   * Get player state (with hidden cards for other players)
   */
  getStateForPlayer(socketId: string): GameState {
    return this.game.getStateForPlayer(socketId);
  }

  /**
   * Get full state (for internal use)
   */
  getState(): GameState {
    return this.game.getState();
  }

  /**
   * Start the game
   */
  start(): void {
    this.game.start();
    this.updateStatus();
  }

  /**
   * Reset the game
   */
  reset(): void {
    this.game.reset();
    this.updateStatus();
  }

  /**
   * Game actions
   */
  fold(socketId: string): boolean {
    return this.game.fold(socketId);
  }

  check(socketId: string): boolean {
    return this.game.check(socketId);
  }

  call(socketId: string): boolean {
    return this.game.call(socketId);
  }

  raise(socketId: string, amount: number): boolean {
    return this.game.raise(socketId, amount);
  }

  allIn(socketId: string): boolean {
    return this.game.allIn(socketId);
  }

  showCards(socketId: string): boolean {
    return this.game.showCards(socketId);
  }

  /**
   * Set showdown callback
   */
  setOnShowdown(callback: (result: any) => void): void {
    this.game.setOnShowdown(callback);
  }

  /**
   * Get showdown result
   */
  showdown(): any {
    return this.game.showdown();
  }

  /**
   * Check if player is at this table
   */
  hasPlayer(socketId: string): boolean {
    return this.playerIds.has(socketId);
  }

  /**
   * Get all player socket IDs (including spectators)
   */
  getAllPlayerIds(): string[] {
    const state = this.game.getState();
    const ids: string[] = [];
    
    state.seats.forEach(p => { if (p) ids.push(p.id); });
    state.spectators.forEach(s => ids.push(s.id));
    
    return ids;
  }
}
