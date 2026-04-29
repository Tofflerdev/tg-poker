import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  validateInitData: vi.fn(),
  createUserFromInitData: vi.fn(),
  assertSafeBootOrExit: vi.fn(),
}));
vi.mock('../models/User.js', () => ({
  userStorage: {
    addUser: vi.fn(),
    getUser: vi.fn(),
    removeUser: vi.fn(),
  },
}));
vi.mock('../TableManager.js', () => {
  // Player '1001' is at seat index 2 (non-zero — validates findIndex logic).
  const mockTable = {
    id: 'table-standard-1',
    updatePlayerSocketId: vi.fn(),
    getStateForPlayer: vi.fn(() => ({
      stage: 'flop',
      seats: [null, null, { id: '1001', name: 'X', chips: 500, isActive: false, isFolded: false, isAllIn: false, isSittingOut: false, socketId: undefined, bet: 0, totalBet: 0, cards: [] }, null, null, null],
      spectators: [],
      communityCards: [],
      pots: [],
      totalPot: 0,
      currentBet: 0,
      currentPlayer: null,
      dealerPosition: 0,
      smallBlind: 10,
      bigBlind: 20,
      turnExpiresAt: null,
      nextHandIn: null,
      lastRoundBets: [],
    })),
    getAllPlayerIds: vi.fn(() => ['1001']),
  };
  return {
    tableManager: {
      setSocketForTelegram: vi.fn(),
      getPlayerTable: vi.fn(() => mockTable),
      getSocketIdForTelegram: vi.fn(),
      _mockTable: mockTable,
    },
  };
});
vi.mock('../GraceRegistry.js', () => ({
  clear: vi.fn(),
}));

import { validateInitData, createUserFromInitData } from '../middleware/auth.js';
import { tableManager } from '../TableManager.js';
import * as GraceRegistry from '../GraceRegistry.js';

/**
 * Inline harness mirroring the EXACT shape of the server/index.ts auth handler.
 * Plan 04-06 must keep server/index.ts in sync with this harness.
 *
 * Key: seat index is computed via state.seats.findIndex(p => p?.id === telegramId),
 * NOT hardcoded to 0. This matches Plan 04-06 Task 1 Edit 2.
 */
function makeAuthHandler(io: any, socket: any) {
  return async (payload: { initData: string; devId?: number }) => {
    const validated = validateInitData(payload.initData);
    if (!validated) {
      socket.emit('authError', 'Invalid authentication data');
      return;
    }
    const user = await createUserFromInitData(validated, payload.devId);
    socket.data.telegramId = String(user.telegramId);
    const telegramId = socket.data.telegramId;

    tableManager.setSocketForTelegram(telegramId, socket.id, (priorSocketId: string) => {
      const prior = io.sockets.sockets.get(priorSocketId);
      if (prior) {
        prior.emit('replacedBySession');
        prior.disconnect(true);
      }
    });

    const seatedTable = tableManager.getPlayerTable(telegramId);
    if (seatedTable) {
      seatedTable.updatePlayerSocketId(telegramId, socket.id);
      const state = seatedTable.getStateForPlayer(telegramId);
      // Seat index computed from state — matches Plan 04-06 Task 1 Edit 2.
      const seatIdx = state.seats.findIndex((p: any) => p?.id === telegramId);
      socket.emit('tableJoined', { tableId: seatedTable.id, seat: seatIdx, state });
      GraceRegistry.clear(telegramId);
    }
    socket.emit('authSuccess', user);
  };
}

const mockSocket = (id = 'socket-A') => ({
  id,
  data: {} as { telegramId?: string },
  emit: vi.fn(),
  disconnect: vi.fn(),
});
const mockIo = (sockets: Map<string, any> = new Map()) => ({
  sockets: { sockets },
});

describe('reconnect handshake', () => {
  beforeEach(() => {
    vi.mocked(validateInitData).mockReset();
    vi.mocked(createUserFromInitData).mockReset();
    vi.mocked(tableManager.setSocketForTelegram).mockReset();
    vi.mocked(GraceRegistry.clear).mockReset();
  });

  it('emits tableJoined with state snapshot for already-seated telegramId (D-A2)', async () => {
    vi.mocked(validateInitData).mockReturnValue({ user: { id: 1001, first_name: 'X' } } as any);
    vi.mocked(createUserFromInitData).mockResolvedValue({ telegramId: 1001 } as any);
    const sock = mockSocket('socket-NEW');
    const io = mockIo();
    const handler = makeAuthHandler(io, sock);
    await handler({ initData: 'valid' });
    expect(sock.emit).toHaveBeenCalledWith('tableJoined', expect.objectContaining({
      tableId: 'table-standard-1',
      state: expect.objectContaining({ stage: 'flop' }),
    }));
  });

  it('tableJoined seat index is computed via findIndex — player at seat 2 yields seat: 2 (D-A2)', async () => {
    // The mockTable returns seats: [null, null, { id: '1001' }, null, null, null]
    // So findIndex(p => p?.id === '1001') === 2. A hardcoded 0 would break this assertion.
    vi.mocked(validateInitData).mockReturnValue({ user: { id: 1001, first_name: 'X' } } as any);
    vi.mocked(createUserFromInitData).mockResolvedValue({ telegramId: 1001 } as any);
    const sock = mockSocket('socket-NEW');
    const handler = makeAuthHandler(mockIo(), sock);
    await handler({ initData: 'valid' });
    expect(sock.emit).toHaveBeenCalledWith('tableJoined', expect.objectContaining({ seat: 2 }));
  });

  it('clears any in-flight GraceRegistry timer on successful reconnect (D-B clear)', async () => {
    vi.mocked(validateInitData).mockReturnValue({ user: { id: 1001, first_name: 'X' } } as any);
    vi.mocked(createUserFromInitData).mockResolvedValue({ telegramId: 1001 } as any);
    const sock = mockSocket('socket-NEW');
    const handler = makeAuthHandler(mockIo(), sock);
    await handler({ initData: 'valid' });
    expect(GraceRegistry.clear).toHaveBeenCalledWith('1001');
  });

  it('emits replacedBySession (NOT sessionReplaced) to prior socket and disconnects it (D-A3)', async () => {
    vi.mocked(validateInitData).mockReturnValue({ user: { id: 1001, first_name: 'X' } } as any);
    vi.mocked(createUserFromInitData).mockResolvedValue({ telegramId: 1001 } as any);
    const priorSock = mockSocket('socket-OLD');
    const newSock = mockSocket('socket-NEW');
    const io = mockIo(new Map([['socket-OLD', priorSock]]));
    // Capture eviction callback
    let evictCb: ((priorId: string) => void) | undefined;
    vi.mocked(tableManager.setSocketForTelegram).mockImplementation((_tid, _sid, cb) => {
      evictCb = cb;
    });
    const handler = makeAuthHandler(io, newSock);
    await handler({ initData: 'valid' });
    expect(evictCb).toBeDefined();
    evictCb!('socket-OLD');
    // Confirm the event name is exactly 'replacedBySession' (not 'sessionReplaced')
    expect(priorSock.emit).toHaveBeenCalledWith('replacedBySession');
    // D-A3 bare event — emitted WITHOUT a second argument (no payload)
    const replacedCalls = priorSock.emit.mock.calls.filter((c: any[]) => c[0] === 'replacedBySession');
    expect(replacedCalls).toHaveLength(1);
    expect(replacedCalls[0]).toHaveLength(1); // bare event — no second argument
    expect(priorSock.emit).not.toHaveBeenCalledWith('sessionReplaced');
    expect(priorSock.disconnect).toHaveBeenCalledWith(true);
  });

  it('reconnect snapshot uses getStateForPlayer (own hole cards path) — RESILIENCE-04 privacy regression', async () => {
    vi.mocked(validateInitData).mockReturnValue({ user: { id: 1001, first_name: 'X' } } as any);
    vi.mocked(createUserFromInitData).mockResolvedValue({ telegramId: 1001 } as any);
    const handler = makeAuthHandler(mockIo(), mockSocket());
    await handler({ initData: 'valid' });
    const tbl = (tableManager as any)._mockTable;
    expect(tbl.getStateForPlayer).toHaveBeenCalledWith('1001');
  });
});
