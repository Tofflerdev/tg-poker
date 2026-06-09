import pkg from "pokersolver";
const { Hand } = pkg;

/**
 * Playtest bot hand-strength evaluation.
 *
 * Buckets a hand into four tiers used by decideAction.ts. This is deliberately
 * SIMPLE and honest (not GTO) — the goal is to accumulate human-vs-bot hands and
 * surface engine bugs (side pots, showdown), not to play optimally.
 *
 * Postflop tiers follow pokersolver's `rank` scale (verified):
 *   1 High Card · 2 Pair · 3 Two Pair · 4 Trips · 5 Straight · 6 Flush
 *   7 Full House · 8 Quads · 9 Straight/Royal Flush
 */
export type Strength = 'premium' | 'strong' | 'medium' | 'weak';

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

interface ParsedCard {
  rank: number;
  suit: string;
}

function parseCard(card: string): ParsedCard {
  // pokersolver format: rank char(s) + suit, e.g. "As", "Td", "9h"
  return { rank: RANK_VALUE[card[0]] ?? 0, suit: card[1] };
}

/**
 * Preflop strength from two hole cards. Tight buckets:
 *   premium: JJ+, AK, AQ
 *   strong:  88–TT, AJ, KQ
 *   medium:  22–77, broadway-ish (QJ/QT/KJ/KT), suited Ax, suited connectors 78s+
 *   weak:    everything else
 */
export function preflopStrength(hole: string[]): Strength {
  if (hole.length < 2) return 'weak';
  const a = parseCard(hole[0]);
  const b = parseCard(hole[1]);
  const hi = Math.max(a.rank, b.rank);
  const lo = Math.min(a.rank, b.rank);
  const pair = a.rank === b.rank;
  const suited = a.suit === b.suit;
  const gap = hi - lo;

  if (pair) {
    if (hi >= 11) return 'premium'; // JJ+
    if (hi >= 8) return 'strong';   // 88–TT
    return 'medium';                // 22–77
  }

  if (hi === 14 && lo >= 12) return 'premium';      // AK, AQ
  if (hi === 14 && lo === 11) return 'strong';      // AJ
  if (hi === 13 && lo === 12) return 'strong';      // KQ
  if (hi >= 12 && lo >= 10) return 'medium';        // QJ/QT/KJ/KT
  if (hi === 14) return suited ? 'medium' : 'weak'; // Ax
  if (suited && gap <= 1 && lo >= 7) return 'medium'; // suited connectors 78s+
  return 'weak';
}

/** Postflop strength from the best 5-card hand (hole + community) via pokersolver. */
export function postflopStrength(hole: string[], community: string[]): Strength {
  const rank = Hand.solve([...hole, ...community]).rank;
  if (rank >= 7) return 'premium';          // full house+
  if (rank >= 3) return 'strong';           // two pair, trips, straight, flush
  if (rank === 2) return 'medium';          // one pair
  return 'weak';                            // high card
}

/** Picks pre/postflop evaluation based on how many community cards are out. */
export function evaluateStrength(hole: string[], community: string[]): Strength {
  if (community.length < 3) return preflopStrength(hole);
  return postflopStrength(hole, community);
}
