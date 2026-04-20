import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the repository BEFORE importing the queue so the singleton picks it up.
vi.mock('../db/HandHistoryRepository.js', () => {
  return {
    HandHistoryRepository: {
      createMany: vi.fn(async (rows: any[]) => ({ count: rows.length })),
      deleteOlderThan: vi.fn(async () => ({ count: 0 })),
      toWriteRow: vi.fn(),
    },
  };
});

import * as Queue from '../HandHistoryQueue.js';
import { HandHistoryRepository } from '../db/HandHistoryRepository.js';

const mkRow = (handId: string, telegramId = '1001'): any => ({
  handId,
  telegramId,
  tableId: 'table-standard-1',
  playedAt: new Date(),
  board: ['As', 'Kd', 'Qc'],
  holeCards: ['Th', '9h'],
  seat: 0,
  netDelta: 100,
  finalChips: 1100,
  showedDown: true,
  won: true,
});

describe('HandHistoryQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Queue.__resetForTests();
    vi.mocked(HandHistoryRepository.createMany).mockReset();
    vi.mocked(HandHistoryRepository.createMany).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    Queue.__resetForTests();
    vi.useRealTimers();
  });

  it('buffers a row on enqueue without immediate flush below threshold', async () => {
    Queue.enqueue(mkRow('h1'));
    expect(Queue.__getInternalsForTests().buffer.length).toBe(1);
    expect(HandHistoryRepository.createMany).not.toHaveBeenCalled();
  });

  it('flushes immediately when buffer reaches 50 rows', async () => {
    for (let i = 0; i < 50; i++) Queue.enqueue(mkRow(`h${i}`));
    await vi.runAllTimersAsync();
    expect(HandHistoryRepository.createMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(HandHistoryRepository.createMany).mock.calls[0][0]).toHaveLength(50);
    expect(Queue.__getInternalsForTests().buffer.length).toBe(0);
  });

  it('flushes on the 1-second interval', async () => {
    Queue.startFlushTimer();
    Queue.enqueue(mkRow('h1'));
    Queue.enqueue(mkRow('h2'));
    expect(HandHistoryRepository.createMany).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(HandHistoryRepository.createMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(HandHistoryRepository.createMany).mock.calls[0][0]).toHaveLength(2);
  });

  it('startFlushTimer is idempotent (double call does not double-register)', async () => {
    Queue.startFlushTimer();
    const first = Queue.__getInternalsForTests().flushTimer;
    Queue.startFlushTimer();
    const second = Queue.__getInternalsForTests().flushTimer;
    expect(first).toBe(second);
  });

  it('retries with backoff and drops after 3 attempts', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(HandHistoryRepository.createMany)
      .mockRejectedValueOnce(new Error('db down 1'))
      .mockRejectedValueOnce(new Error('db down 2'))
      .mockRejectedValueOnce(new Error('db down 3'));

    Queue.enqueue(mkRow('h-fail'));
    Queue.startFlushTimer();
    // Trigger first flush attempt
    await vi.advanceTimersByTimeAsync(1000);
    // Allow retry delays (100ms then 500ms = 600ms total) + microtask flushes
    await vi.advanceTimersByTimeAsync(700);

    expect(HandHistoryRepository.createMany).toHaveBeenCalledTimes(3);
    expect(errSpy).toHaveBeenCalledWith(
      '[HandHistoryQueue] dropping batch after 3 attempts. handIds:',
      ['h-fail'],
      'error:',
      expect.any(Error)
    );
    // Buffer untouched after drop (no re-enqueue)
    expect(Queue.__getInternalsForTests().buffer.length).toBe(0);
    errSpy.mockRestore();
  });

  it('shutdown clears the timer and drains the remaining buffer', async () => {
    Queue.startFlushTimer();
    Queue.enqueue(mkRow('h-final'));
    await Queue.shutdown();
    expect(HandHistoryRepository.createMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(HandHistoryRepository.createMany).mock.calls[0][0]).toHaveLength(1);
    expect(Queue.__getInternalsForTests().flushTimer).toBeNull();
  });
});
