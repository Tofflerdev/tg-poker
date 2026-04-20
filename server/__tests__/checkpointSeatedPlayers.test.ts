import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/UserRepository.js', () => ({
  UserRepository: {
    checkpointSeat: vi.fn(async () => {}),
  },
}));

import { checkpointSeatedPlayers } from '../checkpointSeatedPlayers.js';
import { UserRepository } from '../db/UserRepository.js';
import type { HandCompleteEvent } from '../../types/index.js';

const mkEvt = (perPlayer: any[]): HandCompleteEvent => ({
  handId: 'h-1',
  tableId: 'table-standard-1',
  completedAt: new Date('2026-04-18T00:00:00Z'),
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  perPlayer,
});

describe('checkpointSeatedPlayers', () => {
  beforeEach(() => {
    vi.mocked(UserRepository.checkpointSeat).mockReset();
    vi.mocked(UserRepository.checkpointSeat).mockResolvedValue(undefined);
  });

  it('calls checkpointSeat once per perPlayer entry with correct trio', async () => {
    const evt = mkEvt([
      { telegramId: '1001', seat: 0, holeCards: ['As', 'Ks'], finalChips: 1500, netDelta: 500, won: true, showedDown: true },
      { telegramId: '1002', seat: 2, holeCards: ['Qc', 'Qd'], finalChips: 800, netDelta: -200, won: false, showedDown: true },
      { telegramId: '1003', seat: 4, holeCards: ['7h', '2d'], finalChips: 1000, netDelta: 0, won: false, showedDown: false },
    ]);

    await checkpointSeatedPlayers(evt);

    expect(UserRepository.checkpointSeat).toHaveBeenCalledTimes(3);
    expect(UserRepository.checkpointSeat).toHaveBeenCalledWith('1001', {
      currentChips: 1500,
      currentTableId: 'table-standard-1',
      currentSeat: 0,
    });
    expect(UserRepository.checkpointSeat).toHaveBeenCalledWith('1002', {
      currentChips: 800,
      currentTableId: 'table-standard-1',
      currentSeat: 2,
    });
    expect(UserRepository.checkpointSeat).toHaveBeenCalledWith('1003', {
      currentChips: 1000,
      currentTableId: 'table-standard-1',
      currentSeat: 4,
    });
  });

  it('does not write holeCards, netDelta, won, or showedDown (D-17)', async () => {
    const evt = mkEvt([
      { telegramId: '1001', seat: 0, holeCards: ['As', 'Ks'], finalChips: 1500, netDelta: 500, won: true, showedDown: true },
    ]);
    await checkpointSeatedPlayers(evt);
    const callArg = vi.mocked(UserRepository.checkpointSeat).mock.calls[0][1] as object;
    expect(Object.keys(callArg).sort()).toEqual(['currentChips', 'currentSeat', 'currentTableId']);
  });

  it('rejects when any per-seat update rejects', async () => {
    vi.mocked(UserRepository.checkpointSeat)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('db down'));
    const evt = mkEvt([
      { telegramId: '1001', seat: 0, holeCards: ['As'], finalChips: 100, netDelta: 0, won: false, showedDown: false },
      { telegramId: '1002', seat: 1, holeCards: ['Kd'], finalChips: 200, netDelta: 0, won: false, showedDown: false },
    ]);
    await expect(checkpointSeatedPlayers(evt)).rejects.toThrow('db down');
  });

  it('accepts an empty perPlayer array (no-op)', async () => {
    await checkpointSeatedPlayers(mkEvt([]));
    expect(UserRepository.checkpointSeat).not.toHaveBeenCalled();
  });
});
