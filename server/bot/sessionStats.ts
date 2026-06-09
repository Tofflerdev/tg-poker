import type { PlayerActionKind } from '../../types/index.js';
import type { OracleHand, ParsedSession } from './oracle.js';

/**
 * Objective gameplay/stability metrics over a parsed session. These feed the
 * Reviewer report's "Balance / gameplay" and "Stability" sections — the numbers
 * a human (or Claude) interprets, computed once and consistently.
 *
 * Bots are identified by their reserved negative telegramId (see botRegistry).
 */
export function isBotId(id: string): boolean {
  return id.startsWith('-');
}

export interface PlayerStats {
  id: string;
  isBot: boolean;
  handsSeen: number;       // appeared in perPlayer
  handsVoluntary: number;  // entered the pot with a voluntary action (call/bet/raise/allin)
  handsWon: number;
  net: number;             // Σ netDelta
  allIns: number;          // hands finished with 0 chips while invested (proxy for all-in)
}

export interface SessionStats {
  handsTotal: number;
  handsByTable: Record<string, number>;
  showdownHands: number;
  winByFoldHands: number;
  sidePotHands: number;
  allInHands: number;
  actionCounts: Record<PlayerActionKind, number>;
  avgPot: number;
  biggestPot: number;
  players: PlayerStats[];
  humans: number;
  bots: number;
  firstTs: number | null;
  lastTs: number | null;
  durationMs: number | null;
}

const VOLUNTARY: ReadonlySet<PlayerActionKind> = new Set(['call', 'bet', 'raise', 'allin']);

export function computeStats(parsed: ParsedSession): SessionStats {
  const handsByTable: Record<string, number> = {};
  const actionCounts: Record<PlayerActionKind, number> = {
    fold: 0, check: 0, call: 0, bet: 0, raise: 0, allin: 0,
  };
  const players = new Map<string, PlayerStats>();
  const ensure = (id: string): PlayerStats => {
    let p = players.get(id);
    if (!p) {
      p = { id, isBot: isBotId(id), handsSeen: 0, handsVoluntary: 0, handsWon: 0, net: 0, allIns: 0 };
      players.set(id, p);
    }
    return p;
  };

  let showdownHands = 0;
  let winByFoldHands = 0;
  let sidePotHands = 0;
  let allInHands = 0;
  let potTotal = 0;
  let potHands = 0;
  let biggestPot = 0;

  for (const { hand, actions } of parsed.hands as OracleHand[]) {
    handsByTable[hand.tableId] = (handsByTable[hand.tableId] ?? 0) + 1;

    const showedDown = hand.perPlayer.filter((p) => p.showedDown).length;
    if (showedDown >= 2) showdownHands++;
    else winByFoldHands++;

    if (hand.pots && hand.pots.length > 1) sidePotHands++;
    if (hand.pots && hand.pots.length > 0) {
      const pot = hand.pots.reduce((s, p) => s + p.amount, 0);
      potTotal += pot;
      potHands++;
      if (pot > biggestPot) biggestPot = pot;
    }

    let handHadAllIn = false;
    for (const p of hand.perPlayer) {
      const ps = ensure(p.telegramId);
      ps.handsSeen++;
      ps.net += p.netDelta;
      if (p.won) ps.handsWon++;
      // All-in proxy: ended the hand with 0 chips while having invested.
      if (p.finalChips === 0 && (p.contributed ?? 0) > 0) {
        ps.allIns++;
        handHadAllIn = true;
      }
    }
    if (handHadAllIn) allInHands++;

    // Voluntary entry from this hand's recorded actions (blinds are not recorded).
    const voluntaryIds = new Set<string>();
    for (const a of actions) {
      actionCounts[a.action] = (actionCounts[a.action] ?? 0) + 1;
      if (VOLUNTARY.has(a.action)) voluntaryIds.add(a.telegramId);
    }
    voluntaryIds.forEach((id) => { ensure(id).handsVoluntary++; });
  }

  const playerList = [...players.values()].sort((a, b) => b.net - a.net);
  return {
    handsTotal: parsed.hands.length,
    handsByTable,
    showdownHands,
    winByFoldHands,
    sidePotHands,
    allInHands,
    actionCounts,
    avgPot: potHands > 0 ? Math.round(potTotal / potHands) : 0,
    biggestPot,
    players: playerList,
    humans: playerList.filter((p) => !p.isBot).length,
    bots: playerList.filter((p) => p.isBot).length,
    firstTs: parsed.firstTs,
    lastTs: parsed.lastTs,
    durationMs: parsed.firstTs !== null && parsed.lastTs !== null ? parsed.lastTs - parsed.firstTs : null,
  };
}
