import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db/HandHistoryRepository.js', () => ({
  HandHistoryRepository: {
    createMany: vi.fn(async () => ({ count: 0 })),
    deleteOlderThan: vi.fn(async () => ({ count: 7 })),
    toWriteRow: vi.fn(),
  },
}));

import * as Queue from '../HandHistoryQueue.js';
import { HandHistoryRepository } from '../db/HandHistoryRepository.js';

describe('HandHistory retention job', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T00:00:00Z'));
    Queue.__resetForTests();
    vi.mocked(HandHistoryRepository.deleteOlderThan).mockClear();
    vi.mocked(HandHistoryRepository.deleteOlderThan).mockResolvedValue({ count: 7 });
  });

  afterEach(() => {
    Queue.__resetForTests();
    vi.useRealTimers();
  });

  it('runs an immediate sweep on start and deletes rows older than 90 days', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Queue.startRetentionJob();
    await vi.runOnlyPendingTimersAsync();
    expect(HandHistoryRepository.deleteOlderThan).toHaveBeenCalledTimes(1);
    const cutoff = vi.mocked(HandHistoryRepository.deleteOlderThan).mock.calls[0][0] as Date;
    const expected = new Date('2026-04-18T00:00:00Z').getTime() - 90 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBe(expected);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[RetentionJob] deleted 7 HandHistory rows'));
    logSpy.mockRestore();
  });

  it('schedules recurring sweeps every 24 hours', async () => {
    Queue.startRetentionJob();
    await vi.runOnlyPendingTimersAsync(); // immediate sweep
    expect(HandHistoryRepository.deleteOlderThan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(HandHistoryRepository.deleteOlderThan).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(HandHistoryRepository.deleteOlderThan).toHaveBeenCalledTimes(3);
  });

  it('startRetentionJob is idempotent (no double-registration)', async () => {
    Queue.startRetentionJob();
    const first = Queue.__getInternalsForTests().retentionTimer;
    Queue.startRetentionJob();
    const second = Queue.__getInternalsForTests().retentionTimer;
    expect(first).toBe(second);
  });

  it('logs sweep errors but continues to schedule next interval', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(HandHistoryRepository.deleteOlderThan)
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 3 });

    Queue.startRetentionJob();
    await vi.runOnlyPendingTimersAsync();
    expect(errSpy).toHaveBeenCalledWith('[RetentionJob] sweep failed:', expect.any(Error));

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(HandHistoryRepository.deleteOlderThan).toHaveBeenCalledTimes(2);
    errSpy.mockRestore();
  });
});
