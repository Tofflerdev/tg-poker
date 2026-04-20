import { describe, it, expect, vi } from 'vitest';
import type { ActionBubbleEvent } from '../../types/index.js';

// Replicates the listener body from server/index.ts setupTableEvents → setOnPlayerAction.
// If server/index.ts ever diverges, update this verbatim copy AND the file together.
function broadcastActionBubble(
  evt: ActionBubbleEvent,
  table: { getAllPlayerIds(): string[] },
  getSocketId: (tid: string) => string | undefined,
  io: { to: (sid: string) => { emit: (name: string, payload: unknown) => void } },
) {
  try {
    const playerIds = table.getAllPlayerIds();
    playerIds.forEach((telegramId) => {
      const sid = getSocketId(telegramId);
      if (sid) {
        io.to(sid).emit('actionBubble', evt);
      }
    });
  } catch (err) {
    console.error('[ActionBubble] broadcast error:', err);
  }
}

const sampleEvt: ActionBubbleEvent = {
  tableId: 'T',
  telegramId: '1001',
  seat: 0,
  action: 'raise',
  amount: 100,
  totalBetThisStreet: 100,
  potAfter: 130,
};

describe('actionBubble broadcast', () => {
  it('emits actionBubble once per resolved socketId at the table', () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const table = { getAllPlayerIds: () => ['1001', '1002', '1003'] };
    const getSocketId = (tid: string) =>
      ({ '1001': 's1', '1002': 's2', '1003': 's3' })[tid];

    broadcastActionBubble(sampleEvt, table, getSocketId, io);

    expect(io.to).toHaveBeenCalledTimes(3);
    expect(io.to).toHaveBeenCalledWith('s1');
    expect(io.to).toHaveBeenCalledWith('s2');
    expect(io.to).toHaveBeenCalledWith('s3');
    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenCalledWith('actionBubble', sampleEvt);
  });

  it('skips telegramIds with no live socket', () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const table = { getAllPlayerIds: () => ['1001', '1002'] };
    const getSocketId = (tid: string) => (tid === '1001' ? 's1' : undefined);

    broadcastActionBubble(sampleEvt, table, getSocketId, io);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('actionBubble', sampleEvt);
  });

  it('emits the exact input payload without mutation', () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const table = { getAllPlayerIds: () => ['1001'] };
    broadcastActionBubble(sampleEvt, table, () => 's1', io);
    const payload = emit.mock.calls[0][1];
    expect(payload).toBe(sampleEvt); // same reference — no clone, no projection
    expect(payload).toEqual(sampleEvt);
    // No surprise field added (T-3-SCHEMA)
    expect(Object.keys(payload as object).sort()).toEqual(
      ['action', 'amount', 'potAfter', 'seat', 'tableId', 'telegramId', 'totalBetThisStreet'].sort()
    );
  });

  it('swallows getSocketId exceptions without throwing', () => {
    const emit = vi.fn();
    const io = { to: vi.fn(() => ({ emit })) };
    const table = { getAllPlayerIds: () => ['1001'] };
    const getSocketId = () => { throw new Error('boom'); };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => broadcastActionBubble(sampleEvt, table, getSocketId, io)).not.toThrow();
    expect(errSpy).toHaveBeenCalledWith('[ActionBubble] broadcast error:', expect.any(Error));
    errSpy.mockRestore();
  });
});
