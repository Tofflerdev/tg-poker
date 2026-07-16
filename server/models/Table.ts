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

  // Playtest bots (decision B): when false (default), the table will NOT start
  // bot-only hands — a hand runs only while at least one human is eligible. When
  // true, bots keep playing among themselves to accumulate data without a human.
  botsContinue = false;

  // exit-reconnect A: admin asked to remove the bots while a hand was running; the
  // next between-hands boundary does it (see requestBotRemoval).
  private botRemovalRequested = false;

  // Auto-start timer
  private nextHandTimer: NodeJS.Timeout | null = null;
  private readonly NEXT_HAND_DELAY = 5000; // 5 секунд между раздачами
  private onStateChangeCallback: (() => void) | null = null;

  constructor(id: string, name: string, config: TableConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
    // Прокидываем блайнды и лимит хода из конфига стола в движок. Без этого Game
    // играл захардкоженные 10/20 и 30с независимо от стола (Beginner/Pro/High Stakes).
    this.game = new Game(id, {
      smallBlind: config.smallBlind,
      bigBlind: config.bigBlind,
      turnTimeMs: config.turnTime * 1000,
      rakeBps: config.rakeBps,
      rakeCapBB: config.rakeCapBB,
    });
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
  addPlayer(telegramId: string, seat: number, chips: number, telegramIdNumeric?: number, displayName?: string, avatarUrl?: string, avatarId?: string, isBot?: boolean): boolean {
    if (!this.isSeatAvailable(seat)) {
      return false;
    }

    const success = this.game.addPlayer(telegramId, seat, chips, telegramIdNumeric, displayName, avatarUrl, undefined, avatarId, isBot);
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
    const removed = this.getPlayer(telegramId);
    const wasHuman = !!removed && !removed.isBot;

    this.game.removePlayer(telegramId);
    this.playerIds.delete(telegramId);
    this.updateStatus();

    // Decision D: a human leaving may strand bots. Clean them up — a no-op when
    // a hand is still in progress (deferred to the next between-hands boundary).
    if (wasHuman) this.maybeCleanupBots();

    // Проверяем, нужно ли продолжить/завершить текущую раздачу
    const state = this.game.getState();
    if (state.stage === 'showdown' || state.stage === 'waiting') {
      this.scheduleNextHand();
    }
  }

  // ---- Playtest bot helpers (decisions B + D) ----

  /** A non-bot is seated. */
  private hasSeatedHuman(): boolean {
    return this.game.getState().seats.some((p) => p !== null && !p.isBot);
  }

  /**
   * At least one human can play the next hand. blind-debt: owesBlind does not
   * affect eligibility (debt is settled by posting inside startNextHand), so the
   * old B9 self-lock — gating dealing on a flag only dealing could clear — is
   * structurally gone. See Game.hasPlayableHuman.
   */
  private hasEligibleHuman(): boolean {
    return this.game.hasPlayableHuman();
  }

  /** Decision B: hands may run only with a human present, or when bots-continue is on. */
  private canRunHands(): boolean {
    return this.botsContinue || this.hasEligibleHuman();
  }

  /** Remove every seated bot. Only safe to call between hands. */
  private removeAllBots(): void {
    const botIds = this.game.getState().seats
      .filter((p): p is NonNullable<typeof p> => !!p?.isBot)
      .map((p) => p.id);
    if (botIds.length === 0) return;
    botIds.forEach((id) => {
      this.game.removePlayer(id);
      this.playerIds.delete(id);
    });
    // Nothing left to deal — settle the engine back to 'waiting'.
    if (this.game.getEligiblePlayers().length < 2) {
      this.game.startNextHand(); // returns false, sets stage = 'waiting'
    }
    this.updateStatus();
  }

  /**
   * exit-reconnect A: admin "Remove Bots", deferred to the hand boundary.
   *
   * Bots hold no money, so this is not about refunds — it is about not corrupting
   * the hand the table is in the middle of. removePlayer force-folds a bot that
   * still has cards, which hands a pot it was entitled to (an all-in bot has no
   * decision left to make) to the other players, and drops it out of
   * evt.perPlayer so the session recorder's chip-conservation check no longer
   * balances for that hand. Since bot hands are how the rake gets verified,
   * corrupting them corrupts the measurement.
   *
   * Between hands this removes at once. Mid-hand it marks the bots leaving — they
   * auto-act instantly and are dealt out — and scheduleNextHand() does the removal.
   */
  requestBotRemoval(): number {
    const botIds = this.game.getState().seats
      .filter((p): p is NonNullable<typeof p> => !!p?.isBot)
      .map((p) => p.id);
    if (botIds.length === 0) return 0;

    const stage = this.game.getState().stage;
    if (stage === 'waiting' || stage === 'showdown') {
      this.removeAllBots();
      this.notifyStateChange();
      return botIds.length;
    }

    this.botRemovalRequested = true;
    botIds.forEach((id) => this.game.markLeaving(id));
    this.notifyStateChange();
    return botIds.length;
  }

  /**
   * Decision D: drop idle bots when no humans remain and bots-continue is off.
   * Deferred while a hand is in progress (acts only between hands).
   */
  private maybeCleanupBots(): void {
    // exit-reconnect A: an admin removal request is honoured at the first boundary
    // regardless of botsContinue / seated humans — it was an explicit instruction.
    if (this.botRemovalRequested) {
      const stage = this.game.getState().stage;
      if (stage !== 'waiting' && stage !== 'showdown') return; // still mid-hand
      this.botRemovalRequested = false;
      this.removeAllBots();
      return;
    }
    if (this.botsContinue) return;
    if (this.hasSeatedHuman()) return;
    const stage = this.game.getState().stage;
    if (stage !== 'waiting' && stage !== 'showdown') return; // defer to hand end
    this.removeAllBots();
  }

  /** Admin toggle for the "bots keep playing without a human" option. */
  setBotsContinue(enabled: boolean): void {
    this.botsContinue = enabled;
    if (enabled) {
      this.tryStartNextHand(); // may now start a bot-only hand
    } else {
      this.maybeCleanupBots(); // may now strand bots if no human is present
      this.notifyStateChange();
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

    // Decision D: this is a between-hands boundary — drop stranded bots first.
    this.maybeCleanupBots();

    // Устанавливаем timestamp для UI
    this.game.nextHandIn = Date.now() + this.NEXT_HAND_DELAY;
    this.notifyStateChange();

    const eligibleCount = this.game.getEligiblePlayers().length;

    // Если игроков достаточно ИЛИ мы в стадии showdown (нужно показать победителя перед переходом в waiting).
    // Decision B: never grind bot-only hands unless bots-continue is enabled.
    const state = this.game.getState();
    const shouldSchedule = this.canRunHands() && (eligibleCount >= 2 || state.stage === 'showdown');

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
      // Decision B: require an eligible human (or bots-continue) to start.
      if (eligibleCount >= 2 && this.canRunHands()) {
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
   * exit-reconnect A: mark a player as leaving; the seat is held until the hand
   * boundary settles the exit (see server/PendingExits.ts).
   */
  markLeaving(telegramId: string): boolean {
    const result = this.game.markLeaving(telegramId);
    if (result) {
      this.notifyStateChange();
    }
    return result;
  }

  /** exit-reconnect A: is this player mid-hand right now (has cards, hasn't folded)? */
  isInHand(telegramId: string): boolean {
    return this.game.isInHand(telegramId);
  }

  /** exit-reconnect E: is this player occupying a seat (not a spectator)? */
  isSeated(telegramId: string): boolean {
    return this.game.isSeated(telegramId);
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
