/**
 * crypto-payments-rake phase 2 — pure rake math.
 *
 * Extracted from Game.ts so the tricky cases (no-flop-no-drop, uncalled-bet
 * exemption, single cap across side pots, proportional per-pot split) can be
 * unit-tested deterministically without spinning up a full hand. Game.ts builds
 * the input from live state and delegates here; there is no float on the money
 * path and every result is an integer chip count.
 *
 * See plans/crypto-payments-rake-plan.md §C.
 */

export interface RakeParams {
  rakeBps: number;   // rake in basis points of the raked pot (500 = 5%)
  rakeCapBB: number; // per-hand cap in big blinds (may be fractional, e.g. 2.5)
  bigBlind: number;  // chips per big blind
}

export interface RakeInput {
  /** Pots in settlement order — index 0 is the main pot. Only `amount` matters. */
  pots: { amount: number }[];
  /**
   * Per-player total chips put into the pot this hand, including folded players
   * and dead contributions from players who left mid-hand. Order is irrelevant.
   */
  contributions: number[];
  /** Community cards dealt: < 3 means no flop was seen ⇒ no drop. */
  communityCardCount: number;
  params: RakeParams;
}

export interface RakeResult {
  /** Total chips raked from the hand. */
  total: number;
  /** Rake taken from each pot, aligned index-for-index with `input.pots`. */
  perPot: number[];
}

export function computeRake(input: RakeInput): RakeResult {
  const { pots, contributions, communityCardCount, params } = input;
  const zero: RakeResult = { total: 0, perPot: pots.map(() => 0) };

  // No flop, no drop.
  if (communityCardCount < 3) return zero;
  if (params.rakeBps <= 0) return zero;

  const totalPot = pots.reduce((s, p) => s + p.amount, 0);
  if (totalPot <= 0) return zero;

  // Uncalled bet = the top contributor's excess over the second-highest
  // contributor. That excess was never matched, so it is returned to the bettor,
  // not contested — and must not be raked. Computed from the difference of
  // contributions (NOT pot structure): a single-eligible pot won from folders is
  // legitimately raked; only the true uncalled excess is exempt.
  const sorted = [...contributions].filter((c) => c > 0).sort((a, b) => b - a);
  const uncalled = sorted.length >= 2 ? sorted[0] - sorted[1] : (sorted[0] ?? 0);
  const rakeable = Math.max(0, totalPot - uncalled);

  const capChips = Math.floor(params.rakeCapBB * params.bigBlind);
  let rakeTotal = Math.floor((rakeable * params.rakeBps) / 10000);
  if (capChips > 0) rakeTotal = Math.min(rakeTotal, capChips);
  if (rakeTotal <= 0) return zero;

  // Spread the deduction across pots proportional to size (single cap already
  // applied to the whole hand). Floor each share, then place the rounding
  // remainder starting at the main pot, never exceeding a pot's own amount.
  const perPot = pots.map((p) => Math.floor((rakeTotal * p.amount) / totalPot));
  let remainder = rakeTotal - perPot.reduce((s, x) => s + x, 0);
  for (let i = 0; i < pots.length && remainder > 0; i++) {
    const room = pots[i].amount - perPot[i];
    const add = Math.min(room, remainder);
    perPot[i] += add;
    remainder -= add;
  }

  return { total: rakeTotal - remainder, perPot };
}
