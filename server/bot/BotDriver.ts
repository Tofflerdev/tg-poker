import type { GameState, Player } from '../../types/index.js';
import { decideBotAction, type BotContext, type BotDecision } from './decideAction.js';

/**
 * BotDriver — drives server-side playtest bots.
 *
 * A bot is a normal `Player` in `Game.seats[]` with `isBot === true`, seated via
 * `Game.addPlayer` (no socket). When the turn lands on a bot seat, the driver
 * waits a short, human-like delay (well within the 30s turn timer), decides an
 * action via the pure `decideBotAction`, and calls the same Table action methods
 * the socket handlers use. After acting it invokes `onActed` (which broadcasts
 * state) — that broadcast re-enters `notifyStateChanged`, chaining bot-to-bot.
 *
 * Robustness:
 *  - Single chokepoint: hook `notifyStateChanged(tableId)` into the broadcast
 *    path (updateTableState). It catches human actions, timeouts, and new hands.
 *  - Per-table pending guard keyed by seat prevents double-scheduling one turn.
 *  - The scheduled callback re-validates (table/seat/bot id) before acting, so a
 *    turn that moved on (timeout, leave, cleanup) is safely skipped.
 *  - All scheduling is wrapped so a bot bug can never break state broadcasts.
 */
export interface TableLike {
  getState(): GameState;
  fold(id: string): boolean;
  check(id: string): boolean;
  call(id: string): boolean;
  raise(id: string, amount: number): boolean;
  allIn(id: string): boolean;
}

export interface BotDriverDeps {
  getTable: (tableId: string) => TableLike | undefined;
  onActed: (tableId: string) => void;
  rng?: () => number;
  minDelayMs?: number;
  maxDelayMs?: number;
}

export class BotDriver {
  private pending = new Map<string, { seat: number; timer: NodeJS.Timeout }>();
  private readonly minDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly rng: () => number;

  constructor(private deps: BotDriverDeps) {
    this.minDelayMs = deps.minDelayMs ?? 1000;
    this.maxDelayMs = deps.maxDelayMs ?? 3000;
    this.rng = deps.rng ?? Math.random;
  }

  /** Call after every state broadcast for a table. Schedules a bot turn if due. */
  notifyStateChanged(tableId: string): void {
    try {
      this.maybeSchedule(tableId);
    } catch (err) {
      console.error('[BotDriver] schedule error:', err);
    }
  }

  /** Cancel any pending bot action for a table (e.g. on cleanup / table drain). */
  cancel(tableId: string): void {
    this.clear(tableId);
  }

  private maybeSchedule(tableId: string): void {
    const table = this.deps.getTable(tableId);
    if (!table) {
      this.clear(tableId);
      return;
    }
    const state = table.getState();
    const cp = state.currentPlayer;
    if (cp === null) {
      this.clear(tableId);
      return;
    }
    const player = state.seats[cp];
    if (!player || !player.isBot) {
      // Human's turn (or empty) — nothing for us to schedule.
      return;
    }

    const existing = this.pending.get(tableId);
    if (existing) {
      if (existing.seat === cp) return; // already scheduled for this exact turn
      clearTimeout(existing.timer);     // stale (seat moved) — reschedule
    }

    const delay = Math.floor(this.minDelayMs + this.rng() * (this.maxDelayMs - this.minDelayMs));
    const timer = setTimeout(() => this.fire(tableId, cp, player.id), delay);
    this.pending.set(tableId, { seat: cp, timer });
  }

  private fire(tableId: string, seat: number, botId: string): void {
    this.pending.delete(tableId);
    try {
      const table = this.deps.getTable(tableId);
      if (!table) return;
      const state = table.getState();
      // Re-validate: the turn may have moved (timeout / leave / cleanup).
      if (state.currentPlayer !== seat) return;
      const player = state.seats[seat];
      if (!player || !player.isBot || player.id !== botId) return;

      const decision = decideBotAction(buildContext(state, player, this.rng));
      this.execute(table, player.id, decision);
    } catch (err) {
      console.error('[BotDriver] fire error:', err);
    } finally {
      // Always broadcast — this also chains to the next bot seat (if any).
      this.deps.onActed(tableId);
    }
  }

  private execute(table: TableLike, id: string, decision: BotDecision): void {
    if (this.apply(table, id, decision)) return;
    // Defensive fallback if the chosen action was rejected by the engine.
    if (decision.kind !== 'call' && table.call(id)) return;
    if (table.check(id)) return;
    table.fold(id);
  }

  private apply(table: TableLike, id: string, decision: BotDecision): boolean {
    switch (decision.kind) {
      case 'fold': return table.fold(id);
      case 'check': return table.check(id);
      case 'call': return table.call(id);
      case 'raise': return table.raise(id, decision.amount ?? 0);
      case 'allIn': return table.allIn(id);
      default: return false;
    }
  }

  private clear(tableId: string): void {
    const existing = this.pending.get(tableId);
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(tableId);
    }
  }
}

/** Builds the pure decision context from full server-side state for one bot. */
export function buildContext(state: GameState, player: Player, rng: () => number): BotContext {
  const toCall = Math.max(0, state.currentBet - player.bet);
  const activeCount = state.seats.filter((p) => p !== null && !p.folded).length;
  return {
    hole: player.hand,
    community: state.communityCards,
    stage: state.stage,
    toCall,
    currentBet: state.currentBet,
    myBet: player.bet,
    myChips: player.chips,
    bigBlind: state.bigBlind,
    potTotal: state.totalPot,
    activeCount,
    rng,
  };
}
