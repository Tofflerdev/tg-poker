/**
 * crypto-payments-rake phase 6 — the money invariant, checked on a timer.
 *
 * THE RULE: every chip in the system came from a deposit and leaves through a
 * withdrawal. So at any instant
 *
 *   completed deposits − completed withdrawals
 *     = Σ all account balances + chips sitting on tables + baseline
 *
 * Everything else the economy does (buy-ins, cash-outs, rake, bot buy-ins from
 * the bankroll) only moves chips BETWEEN those buckets and cancels out: rake lands
 * on the house balance, a bot's buy-in leaves the bankroll balance and reappears
 * as chips on a table. A non-zero difference means chips were minted or burned —
 * the one thing that must never happen quietly.
 *
 * CHIPS ON TABLES = seat stacks + the pot. Money already bet is deducted from
 * the stack and lives in `totalPot` (including dead contributions from players
 * who left mid-hand), so counting stacks alone would report a false shortfall
 * equal to the current pot every time a hand is in progress.
 *
 * BASELINE exists because prod balances were wiped by hand twice (§G cleanup and
 * the bot clean-up of 2026-07-23) WITHOUT matching ledger rows: 970 + 194 = 1164
 * chips of ledger history with no balance behind it. Rather than rewrite ledger
 * history, that constant is configuration — set MONEY_INVARIANT_BASELINE_CHIPS
 * to it in prod, leave it 0 anywhere clean.
 */
import prisma from '../db/prisma.js';
import { tableManager } from '../TableManager.js';

export interface MoneyInvariantReport {
  depositedChips: number;
  withdrawnChips: number;
  /** deposits − withdrawals: everything that should exist right now. */
  ledgerNetChips: number;
  /** Σ balances of every account: players, bots, house, bankroll. */
  balancesChips: number;
  /** Stacks + pots across every live table (bots included). */
  chipsInPlay: number;
  baselineChips: number;
  /** ledgerNet − (balances + inPlay + baseline). Must be 0. */
  driftChips: number;
  ok: boolean;
  /** True when a non-zero drift survived a re-check (see checkMoneyInvariant). */
  confirmed: boolean;
  checkedAt: string;
}

/** Chips held on tables right now — stacks plus everything already in the pot. */
export function countChipsInPlay(): number {
  let total = 0;
  for (const table of tableManager.getAllTables()) {
    const state = table.getState();
    for (const seat of state.seats) {
      if (seat) total += seat.chips;
    }
    total += state.totalPot;
  }
  return total;
}

function baselineChips(): number {
  const raw = (process.env.MONEY_INVARIANT_BASELINE_CHIPS ?? '').trim();
  if (raw === '') return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** One measurement. No side effects — the caller decides what to do about it. */
export async function computeMoneyInvariant(): Promise<MoneyInvariantReport> {
  const [deposits, withdrawals, balances] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: 'deposit', status: 'completed' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: 'withdrawal', status: 'completed' },
      _sum: { amount: true },
    }),
    prisma.user.aggregate({ _sum: { balance: true } }),
  ]);

  const depositedChips = deposits._sum.amount ?? 0;
  // Withdrawal amounts are stored as negative deltas.
  const withdrawnChips = Math.abs(withdrawals._sum.amount ?? 0);
  const balancesChips = balances._sum.balance ?? 0;
  const chipsInPlay = countChipsInPlay();
  const baseline = baselineChips();
  const ledgerNetChips = depositedChips - withdrawnChips;
  const driftChips = ledgerNetChips - (balancesChips + chipsInPlay + baseline);

  return {
    depositedChips,
    withdrawnChips,
    ledgerNetChips,
    balancesChips,
    chipsInPlay,
    baselineChips: baseline,
    driftChips,
    ok: driftChips === 0,
    confirmed: false,
    checkedAt: new Date().toISOString(),
  };
}

/** Gap between a suspicious reading and its confirmation. */
const RECHECK_DELAY_MS = 3000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Measure, and if the books do not balance, measure again before crying wolf.
 *
 * A buy-in debits the DB and seats the player as two separate steps, so a check
 * landing exactly between them sees the chips in neither bucket and reports a
 * drift that is not real. A genuine leak persists; a race does not. Only a
 * drift that survives the re-check is reported as `confirmed`.
 */
export async function checkMoneyInvariant(): Promise<MoneyInvariantReport> {
  const first = await computeMoneyInvariant();
  if (first.ok) return first;

  await sleep(RECHECK_DELAY_MS);
  const second = await computeMoneyInvariant();
  if (second.ok) {
    console.warn(
      '[Invariant] transient drift of %d chips cleared on re-check (in-flight buy-in/cash-out)',
      first.driftChips,
    );
    return second;
  }
  return { ...second, confirmed: true };
}

let lastReport: MoneyInvariantReport | null = null;

/** The most recent measurement, for the admin dashboard. */
export function getLastInvariantReport(): MoneyInvariantReport | null {
  return lastReport;
}

export type InvariantAlert = (report: MoneyInvariantReport) => void;

/** Default cadence: often enough to catch a leak the same day, cheap enough to ignore. */
export const INVARIANT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Run the check now and then on a timer. `onAlert` fires ONLY for a confirmed
 * drift — wire it to Sentry/paging. Never throws: a DB hiccup must not take the
 * server down, and the next pass will try again.
 */
export function startMoneyInvariantCheck(
  onAlert?: InvariantAlert,
  intervalMs: number = INVARIANT_INTERVAL_MS,
): () => void {
  const run = async () => {
    try {
      const report = await checkMoneyInvariant();
      lastReport = report;
      if (report.ok) return;
      console.error(
        '[Invariant] MONEY DRIFT %d chips — deposits %d − withdrawals %d = %d, but balances %d + in play %d + baseline %d',
        report.driftChips,
        report.depositedChips,
        report.withdrawnChips,
        report.ledgerNetChips,
        report.balancesChips,
        report.chipsInPlay,
        report.baselineChips,
      );
      onAlert?.(report);
    } catch (err) {
      console.error('[Invariant] check failed:', err);
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

/** Test seam. */
export function __resetInvariantForTests(): void {
  lastReport = null;
}
