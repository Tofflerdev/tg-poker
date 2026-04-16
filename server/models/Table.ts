import type { TableConfig, TableStatus, GameState, PlayerActionEvent, HandCompleteEvent } from '../../types/index.js';
import Game from '../Game.js';

/**
 * Table model representing a poker table
 * Wraps a Game instance and manages table-level state.
 * All player-facing methods accept telegramId (string) as the durable key — RESILIENCE-03.
 */
export class Table {
  id: string;
  name: string;
  config: TableConfig;
  game: Game;
  playerIds: Set<string>; // telegramIds of players at this table
  status: TableStatus;
  createdAt: Date;

  // Auto-start timer
  private nextHandTimer: NodeJS.Timeout | null = null;
  private readonly NEXT_HAND_DELAY = 5000; // 5 секунд между раздачами
  private onStateChangeCallback: (() => void) | null = null;

  constructor(id: string, name: string, config: TableConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.game = new Game(id);
    this.playerIds = new Set();
    this.status = 'waiting';
    this.createdAt = new Date();

    // Setup state change callback
    this.game.setOnStateChange(() => {
      this.updateStatus();
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback();
      }
    });

    // Setup turn timeout callback
    this.game.setOnTurnTimeout(() => {
      // Game class handles auto-fold internally
      // We notify state change to update UI
      this.notifyStateChange();
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
   * @param telegramId  durable player key (stringified Telegram ID)
   */
  addPlayer(telegramId: string, seat: number, chips: number, telegramIdNumeric?: number, displayName?: string, avatarUrl?: string, avatarId?: string): boolean {
    if (!this.isSeatAvailable(seat)) {
      return false;
    }

    const success = this.game.addPlayer(telegramId, seat, chips, telegramIdNumeric, displayName, avatarUrl, undefined, avatarId);
    if (success) {
      this.playerIds.add(telegramId);
      this.updateStatus();
      // Пробуем автоматически начать раздачу
      this.tryStartNextHand();
    }
    return success;
  }

  /**
   * Remove a player from the table (handles mid-hand fold if needed)
   */
  removePlayer(telegramId: string): void {
    this.game.removePlayer(telegramId);
    this.playerIds.delete(telegramId);
    this.updateStatus();

    // Проверяем, нужно ли продолжить/завершить текущую раздачу
    const state = this.game.getState();
    if (state.stage === 'showdown' || state.stage === 'waiting') {
      this.scheduleNextHand();
    }
  }

  /**
   * Remove player mid-game with auto-fold
   */
  removePlayerMidGame(telegramId: string): void {
    this.removePlayer(telegramId);
  }

  /**
   * Update the mutable socketId transport handle for a seated player.
   * Called on connect (set new socketId) and disconnect (set undefined).
   */
  updatePlayerSocketId(telegramId: string, newSocketId: string | undefined): void {
    this.game.updatePlayerSocketId(telegramId, newSocketId);
  }

  /**
   * Schedule next hand to start automatically
   */
  scheduleNextHand(): void {
    // Очищаем существующий таймер
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }

    // Устанавливаем timestamp для UI
    this.game.nextHandIn = Date.now() + this.NEXT_HAND_DELAY;
    this.notifyStateChange();

    const eligibleCount = this.game.getEligiblePlayers().length;

    // Если игроков достаточно ИЛИ мы в стадии showdown (нужно показать победителя перед переходом в waiting)
    const state = this.game.getState();
    const shouldSchedule = eligibleCount >= 2 || state.stage === 'showdown';

    if (shouldSchedule) {
      this.nextHandTimer = setTimeout(() => {
        this.nextHandTimer = null;
        this.game.nextHandIn = null;
        this.game.startNextHand();

        // Уведомляем об изменении состояния, даже если игра не началась (переход в waiting)
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback();
        }
      }, this.NEXT_HAND_DELAY);
    } else {
      // Недостаточно игроков и не showdown - сбрасываем таймер
      this.game.nextHandIn = null;
    }
  }

  /**
   * Try to start next hand (called when player joins)
   */
  tryStartNextHand(): void {
    const state = this.game.getState();

    // Запускаем только если:
    // 1. Сейчас waiting stage ИЛИ showdown
    // 2. Нет активного таймера
    // 3. Достаточно eligible игроков
    if ((state.stage === 'waiting' || state.stage === 'showdown') && !this.nextHandTimer) {
      const eligibleCount = this.game.getEligiblePlayers().length;
      if (eligibleCount >= 2) {
        this.scheduleNextHand();
      }
    }
  }

  /**
   * Set state change callback (for broadcasting updates)
   */
  setOnStateChange(callback: () => void): void {
    this.onStateChangeCallback = callback;
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback();
    }
  }

  /**
   * Add a spectator to the table
   */
  addSpectator(telegramId: string): void {
    this.game.addSpectator(telegramId);
  }

  /**
   * Get player by telegramId
   */
  getPlayer(telegramId: string): any | undefined {
    const state = this.game.getState();
    return state.seats.find(p => p?.id === telegramId) || undefined;
  }

  /**
   * Get player state (with hidden cards for other players)
   */
  getStateForPlayer(telegramId: string): GameState {
    return this.game.getStateForPlayer(telegramId);
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
   * Game actions — all keyed by telegramId (durable identity)
   */
  fold(telegramId: string): boolean {
    return this.game.fold(telegramId);
  }

  check(telegramId: string): boolean {
    return this.game.check(telegramId);
  }

  call(telegramId: string): boolean {
    return this.game.call(telegramId);
  }

  raise(telegramId: string, amount: number): boolean {
    return this.game.raise(telegramId, amount);
  }

  allIn(telegramId: string): boolean {
    return this.game.allIn(telegramId);
  }

  showCards(telegramId: string): boolean {
    return this.game.showCards(telegramId);
  }

  /**
   * Sit out - player voluntarily sits out
   */
  sitOut(telegramId: string): boolean {
    const result = this.game.sitOut(telegramId);
    if (result) {
      this.notifyStateChange();
    }
    return result;
  }

  /**
   * Sit in - player returns from sit out
   */
  sitIn(telegramId: string): boolean {
    const result = this.game.sitIn(telegramId);
    if (result) {
      this.tryStartNextHand();
      this.notifyStateChange();
    }
    return result;
  }

  /**
   * Set showdown callback
   */
  setOnShowdown(callback: (result: any) => void): void {
    this.game.setOnShowdown(callback);
  }

  /**
   * Set player action callback (Phase 1: no-op consumer registered in index.ts)
   */
  setOnPlayerAction(cb: (evt: PlayerActionEvent) => void): void {
    this.game.setOnPlayerAction(cb);
  }

  /**
   * Set hand complete callback (Phase 1: no-op consumer registered in index.ts)
   */
  setOnHandComplete(cb: (evt: HandCompleteEvent) => void): void {
    this.game.setOnHandComplete(cb);
  }

  /**
   * Get showdown result
   */
  showdown(): any {
    return this.game.showdown();
  }

  /**
   * Check if player is at this table (by telegramId)
   */
  hasPlayer(telegramId: string): boolean {
    return this.playerIds.has(telegramId);
  }

  /**
   * Get all player telegramIds (including spectators)
   */
  getAllPlayerIds(): string[] {
    const state = this.game.getState();
    const ids: string[] = [];

    state.seats.forEach(p => { if (p) ids.push(p.id); });
    state.spectators.forEach(s => ids.push(s.id));

    return ids;
  }
}
