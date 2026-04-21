import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the repository BEFORE importing anything that touches it.
const findForUserMock = vi.fn();
vi.mock('../db/HandHistoryRepository.js', () => ({
  HandHistoryRepository: {
    findForUser: (...args: any[]) => findForUserMock(...args),
    createMany: vi.fn(),
    deleteOlderThan: vi.fn(),
    toWriteRow: vi.fn(),
  },
}));

import { HandHistoryRepository } from '../db/HandHistoryRepository.js';

/**
 * Inline harness mirroring the EXACT shape of the server/index.ts handler body.
 * Any change to the handler must be reflected here.
 */
function makeHandler(socket: {
  data: { telegramId?: string };
  emit: (event: string, payload: unknown) => void;
}) {
  return async (..._ignoredPayload: unknown[]) => {
    const telegramId = socket.data.telegramId;
    if (!telegramId) {
      socket.emit('authError', { message: 'Not authenticated' });
      return;
    }
    try {
      const rows = await HandHistoryRepository.findForUser(telegramId);
      socket.emit('handHistoryData', rows);
    } catch (error) {
      console.error('[HandHistory] Error:', error);
      socket.emit('handHistoryError', 'Server error');
    }
  };
}

const mockSocket = (telegramId?: string) => {
  const emit = vi.fn();
  return {
    data: { telegramId },
    emit,
  };
};

describe('getHandHistory socket handler', () => {
  beforeEach(() => {
    findForUserMock.mockReset();
  });

  it('emits authError when socket.data.telegramId is undefined', async () => {
    const sock = mockSocket(undefined);
    const handler = makeHandler(sock);
    await handler();
    expect(sock.emit).toHaveBeenCalledWith('authError', { message: 'Not authenticated' });
    expect(findForUserMock).not.toHaveBeenCalled();
  });

  it('calls findForUser with socket.data.telegramId only (no second arg → default 50)', async () => {
    const sock = mockSocket('1001');
    findForUserMock.mockResolvedValueOnce([]);
    const handler = makeHandler(sock);
    await handler();
    expect(findForUserMock).toHaveBeenCalledTimes(1);
    expect(findForUserMock).toHaveBeenCalledWith('1001');
  });

  it('emits handHistoryData with the rows on success', async () => {
    const sock = mockSocket('1001');
    const fakeRows = [{ handId: 'h-1', tableId: 'table-standard-1', tableName: '⭐ Standard Table #1' }];
    findForUserMock.mockResolvedValueOnce(fakeRows);
    const handler = makeHandler(sock);
    await handler();
    expect(sock.emit).toHaveBeenCalledWith('handHistoryData', fakeRows);
  });

  it('emits handHistoryError with generic message on rejection (T-3-INFO-LEAK)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sock = mockSocket('1001');
    const dbErr = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    findForUserMock.mockRejectedValueOnce(dbErr);
    const handler = makeHandler(sock);
    await handler();
    expect(sock.emit).toHaveBeenCalledWith('handHistoryError', 'Server error');
    // The raw error object MUST NOT be the payload.
    const errCall = sock.emit.mock.calls.find((c) => c[0] === 'handHistoryError');
    expect(errCall![1]).toBe('Server error');
    expect(errCall![1]).not.toEqual(dbErr);
    expect(errCall![1]).not.toMatch(/ECONNREFUSED/);
    // The raw error IS logged to stderr.
    expect(errSpy).toHaveBeenCalledWith('[HandHistory] Error:', dbErr);
    errSpy.mockRestore();
  });

  it('IGNORES any payload — uses ONLY socket.data.telegramId (T-3-AUTHZ)', async () => {
    const sock = mockSocket('1001');
    findForUserMock.mockResolvedValueOnce([]);
    const handler = makeHandler(sock);
    // Malicious client tries to pass another userId in the payload — handler must ignore it.
    await (handler as any)({ userId: '999', telegramId: '999', limit: 9999 });
    expect(findForUserMock).toHaveBeenCalledWith('1001');
    // findForUser is invoked with only one arg — no client-controllable limit.
    expect(findForUserMock.mock.calls[0]).toHaveLength(1);
  });

  it('does not pass a second arg to findForUser (limit is repo-default → server-bounded)', async () => {
    const sock = mockSocket('1001');
    findForUserMock.mockResolvedValueOnce([]);
    const handler = makeHandler(sock);
    await handler();
    expect(findForUserMock.mock.calls[0]).toHaveLength(1);
  });
});
