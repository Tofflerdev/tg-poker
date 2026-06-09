import pkg from 'pokersolver';
import type { PlayerActionEvent, HandCompleteEvent, HandCompletePerPlayer } from '../../types/index.js';
import type { RecordedLine } from './SessionRecorder.js';
const { Hand } = pkg;

/**
 * Oracle — independent replay-based verification of recorded playtest hands.
 *
 * Reads a session JSONL (see SessionRecorder), groups events into hands, and
 * re-derives correctness invariants WITHOUT trusting the engine's own result.
 * Every finding is a "rules correctness" issue — the category where the most
 * expensive bugs live (side pots, showdown, chip accounting).
 *
 * Invariants checked per hand (when the data is available):
 *  1. chipConservation  — Σ netDelta == 0 (no chips created/destroyed)
 *  2. potsAccounting    — Σ pot.amount == Σ contributed (every chip put in is in a pot)
 *  3. eligibility       — pot eligible sets are real, nested, and (at showdown) non-folded
 *  4. winnerRecompute   — pokersolver winners per pot match the `won` flags
 *
 * Caveat: chipConservation can false-positive if a player LEAVES mid-hand (their
 * seat is dropped from perPlayer while their committed chips stay in the pot).
 * The reviewer should weigh this against the table's leave activity.
 */
export interface OracleFinding {
  handId: string;
  tableId: string;
  check: 'chipConservation' | 'potsAccounting' | 'eligibility' | 'winnerRecompute' | 'parse';
  message: string;
  detail?: unknown;
}

export interface OracleHand {
  hand: HandCompleteEvent;
  actions: PlayerActionEvent[]; // voluntary actions recorded for this table before the hand completed
}

export interface OracleReport {
  handsChecked: number;
  findings: OracleFinding[];
}

const EPS = 0; // chips are integers — exact equality

function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export interface ParsedSession {
  hands: OracleHand[];
  findings: OracleFinding[];
  firstTs: number | null;
  lastTs: number | null;
}

/** Parse a session JSONL string into per-hand records (streaming, per table). */
export function parseSession(text: string): ParsedSession {
  const hands: OracleHand[] = [];
  const findings: OracleFinding[] = [];
  const actionBuf = new Map<string, PlayerActionEvent[]>(); // tableId -> buffered actions
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    let parsed: RecordedLine;
    try {
      parsed = JSON.parse(raw) as RecordedLine;
    } catch {
      findings.push({ handId: '?', tableId: '?', check: 'parse', message: `Malformed JSONL at line ${i + 1}` });
      continue;
    }
    if (typeof parsed.ts === 'number') {
      if (firstTs === null) firstTs = parsed.ts;
      lastTs = parsed.ts;
    }
    if (parsed.kind === 'action') {
      const buf = actionBuf.get(parsed.e.tableId) ?? [];
      buf.push(parsed.e);
      actionBuf.set(parsed.e.tableId, buf);
    } else if (parsed.kind === 'hand') {
      const actions = actionBuf.get(parsed.e.tableId) ?? [];
      hands.push({ hand: parsed.e, actions });
      actionBuf.set(parsed.e.tableId, []); // reset buffer for the next hand on this table
    }
  }
  return { hands, findings, firstTs, lastTs };
}

/** Run all invariant checks against one completed hand. */
export function checkHand(h: HandCompleteEvent): OracleFinding[] {
  const findings: OracleFinding[] = [];
  const at = (check: OracleFinding['check'], message: string, detail?: unknown) =>
    findings.push({ handId: h.handId, tableId: h.tableId, check, message, detail });

  const byId = new Map<string, HandCompletePerPlayer>();
  h.perPlayer.forEach((p) => byId.set(p.telegramId, p));
  const showedDown = new Set(h.perPlayer.filter((p) => p.showedDown).map((p) => p.telegramId));
  const isShowdown = showedDown.size >= 2;

  // 1. Chip conservation.
  const netSum = h.perPlayer.reduce((s, p) => s + p.netDelta, 0);
  if (Math.abs(netSum) > EPS) {
    at('chipConservation', `Σ netDelta = ${netSum} (expected 0)`, { netSum });
  }

  // 2-4 need the pot snapshot.
  if (h.pots && h.pots.length > 0) {
    const potSum = h.pots.reduce((s, p) => s + p.amount, 0);
    const contributedSum = h.perPlayer.reduce((s, p) => s + (p.contributed ?? 0), 0);

    // 2. Pots account for all contributions.
    if (Math.abs(potSum - contributedSum) > EPS) {
      at('potsAccounting', `Σ pots (${potSum}) != Σ contributed (${contributedSum})`, { potSum, contributedSum });
    }
    h.pots.forEach((p) => {
      if (p.amount <= 0) at('potsAccounting', `${p.name} has non-positive amount ${p.amount}`, { pot: p });
    });

    // 3. Eligibility validity.
    h.pots.forEach((p) => {
      p.eligiblePlayers.forEach((id) => {
        if (!byId.has(id)) at('eligibility', `${p.name} lists eligible '${id}' not present in perPlayer`, { pot: p });
        else if (isShowdown && !showedDown.has(id)) {
          at('eligibility', `${p.name} lists folded/non-showdown '${id}' as eligible`, { pot: p });
        }
      });
    });
    // Nesting: each side pot's eligible set ⊆ the previous pot's set.
    for (let i = 1; i < h.pots.length; i++) {
      const prev = new Set(h.pots[i - 1].eligiblePlayers);
      const cur = h.pots[i].eligiblePlayers;
      if (!cur.every((id) => prev.has(id))) {
        at('eligibility', `${h.pots[i].name} eligible set is not nested within ${h.pots[i - 1].name}`, {
          prev: h.pots[i - 1].eligiblePlayers, cur,
        });
      }
    }

    // 4. Independent winner recompute (showdown hands only — folds can't be re-derived from cards).
    if (isShowdown && h.board.length === 5) {
      const expectedWinners = new Set<string>();
      for (const pot of h.pots) {
        const contenders = pot.eligiblePlayers
          .map((id) => byId.get(id))
          .filter((p): p is HandCompletePerPlayer => !!p && p.holeCards.length >= 2);
        if (contenders.length === 0) continue;
        const solved = contenders.map((p) => ({ id: p.telegramId, hand: Hand.solve([...p.holeCards, ...h.board]) }));
        const winnerHands = Hand.winners(solved.map((s) => s.hand));
        solved.filter((s) => winnerHands.includes(s.hand)).forEach((s) => expectedWinners.add(s.id));
      }
      const actualWinners = new Set(h.perPlayer.filter((p) => p.won).map((p) => p.telegramId));
      if (!setEq(expectedWinners, actualWinners)) {
        at('winnerRecompute', `recomputed winners {${[...expectedWinners].join(',')}} != reported {${[...actualWinners].join(',')}}`, {
          expected: [...expectedWinners], actual: [...actualWinners], board: h.board,
        });
      }
    }
  }

  return findings;
}

/** Parse + check an entire session. */
export function runOracle(text: string): OracleReport {
  const { hands, findings: parseFindings } = parseSession(text);
  const findings = [...parseFindings];
  for (const { hand } of hands) findings.push(...checkHand(hand));
  return { handsChecked: hands.length, findings };
}
