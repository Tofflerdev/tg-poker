import { describe, it, expect } from 'vitest';
import { SessionRecorder, serializeAction, serializeHand } from '../bot/SessionRecorder.js';
import type { PlayerActionEvent, HandCompleteEvent } from '../../types/index.js';

const action: PlayerActionEvent = {
  tableId: 't1', telegramId: '-1', seat: 2, action: 'raise',
  amount: 40, totalBetThisStreet: 60, potAfter: 150,
};

const hand: HandCompleteEvent = {
  handId: 'h-1', tableId: 't1', completedAt: new Date('2026-06-09T00:00:00Z'),
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  perPlayer: [
    { telegramId: '100', seat: 0, holeCards: ['Ah', 'Ad'], finalChips: 900, netDelta: -100, won: false, showedDown: true },
    { telegramId: '-1', seat: 2, holeCards: ['9s', '8s'], finalChips: 1200, netDelta: 200, won: true, showedDown: true },
  ],
};

describe('serializers', () => {
  it('tags action lines with kind/ts and nests the raw event', () => {
    const parsed = JSON.parse(serializeAction(action, 1700));
    expect(parsed).toEqual({ ts: 1700, kind: 'action', e: action });
  });

  it('tags hand lines and preserves raw hole cards for every seat', () => {
    const parsed = JSON.parse(serializeHand(hand, 1800));
    expect(parsed.kind).toBe('hand');
    expect(parsed.ts).toBe(1800);
    expect(parsed.e.perPlayer.map((p: any) => p.holeCards)).toEqual([['Ah', 'Ad'], ['9s', '8s']]);
  });
});

describe('SessionRecorder', () => {
  it('writes one JSONL line per event through the sink when enabled', () => {
    const lines: string[] = [];
    const rec = new SessionRecorder({ enabled: true, now: () => 42, sink: (l) => lines.push(l) });

    rec.recordAction(action);
    rec.recordHandComplete(hand);

    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.endsWith('\n'))).toBe(true);
    expect(JSON.parse(lines[0])).toMatchObject({ ts: 42, kind: 'action' });
    expect(JSON.parse(lines[1])).toMatchObject({ ts: 42, kind: 'hand' });
  });

  it('is a no-op when disabled (no sink calls, no file path)', () => {
    const lines: string[] = [];
    const rec = new SessionRecorder({ enabled: false, sink: (l) => lines.push(l) });

    rec.recordAction(action);
    rec.recordHandComplete(hand);

    expect(lines).toHaveLength(0);
    expect(rec.isEnabled).toBe(false);
    expect(rec.path).toBeNull();
  });
});
