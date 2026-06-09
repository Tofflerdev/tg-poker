import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  default: { adminAuditLog: { create: vi.fn(async () => ({ id: 'a1' })) } },
}));
vi.mock('../db/UserRepository.js', () => ({
  UserRepository: { ensureBotUser: vi.fn(async () => {}) },
}));
vi.mock('../TableManager.js', () => ({
  tableManager: { getTable: vi.fn(), getActiveBotIds: vi.fn(() => new Set<string>()) },
}));

import { addBots, removeBots } from '../admin/adminMutations.js';
import { tableManager } from '../TableManager.js';
import { UserRepository } from '../db/UserRepository.js';

type Seat = { id: string; isBot: boolean } | null;

function makeFakeTable(occupied: { seat: number; isBot: boolean; id?: string }[] = []) {
  const seats: Seat[] = Array(6).fill(null);
  occupied.forEach(({ seat, isBot, id }) => {
    seats[seat] = { id: id ?? `p${seat}`, isBot };
  });
  return {
    seats,
    config: { buyIn: 500 },
    getState: () => ({ seats }),
    findFirstAvailableSeat: () => seats.findIndex((s) => s === null),
    addPlayer: vi.fn((id: string, seat: number) => {
      seats[seat] = { id, isBot: true };
      return true;
    }),
    removePlayer: vi.fn((id: string) => {
      const i = seats.findIndex((s) => s?.id === id);
      if (i >= 0) seats[i] = null;
    }),
  };
}

function wire(table: ReturnType<typeof makeFakeTable>) {
  vi.mocked(tableManager.getTable).mockReturnValue(table as any);
  // Reflect currently-seated bots so successive identities don't collide.
  vi.mocked(tableManager.getActiveBotIds).mockImplementation(
    () => new Set(table.seats.filter((s) => s?.isBot).map((s) => s!.id)),
  );
}

describe('addBots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seats the requested number of bots with distinct reserved ids and a User row each', async () => {
    const table = makeFakeTable();
    wire(table);

    const { added } = await addBots('admin', 't', 3);

    expect(added).toBe(3);
    expect(table.addPlayer).toHaveBeenCalledTimes(3);
    expect(UserRepository.ensureBotUser).toHaveBeenCalledTimes(3);
    const seatedIds = table.seats.filter((s) => s?.isBot).map((s) => s!.id);
    expect(new Set(seatedIds).size).toBe(3);              // distinct
    expect(seatedIds).toEqual(['-1', '-2', '-3']);        // reserved negative range
  });

  it('writes the audit row before seating', async () => {
    const table = makeFakeTable();
    wire(table);
    const prisma = (await import('../db/prisma.js')).default as any;
    const order: string[] = [];
    prisma.adminAuditLog.create.mockImplementation(async () => { order.push('audit'); return { id: 'a' }; });
    table.addPlayer.mockImplementation((id: string, seat: number) => {
      order.push('seat');
      table.seats[seat] = { id, isBot: true };
      return true;
    });

    await addBots('admin', 't', 1);
    expect(order[0]).toBe('audit');
    expect(order).toContain('seat');
  });

  it('stops early when the table fills up', async () => {
    // 5 of 6 seats already taken by humans.
    const table = makeFakeTable([0, 1, 2, 3, 4].map((seat) => ({ seat, isBot: false })));
    wire(table);

    const { added } = await addBots('admin', 't', 3);
    expect(added).toBe(1);
    expect(table.addPlayer).toHaveBeenCalledTimes(1);
  });

  it('throws when the table does not exist', async () => {
    vi.mocked(tableManager.getTable).mockReturnValue(undefined);
    await expect(addBots('admin', 'nope', 2)).rejects.toThrow(/not found/);
  });
});

describe('removeBots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes only bot seats, leaving humans', async () => {
    const table = makeFakeTable([
      { seat: 0, isBot: false, id: 'human' },
      { seat: 1, isBot: true, id: '-1' },
      { seat: 2, isBot: true, id: '-2' },
    ]);
    wire(table);

    const { removed } = await removeBots('admin', 't');

    expect(removed).toBe(2);
    expect(table.removePlayer).toHaveBeenCalledWith('-1');
    expect(table.removePlayer).toHaveBeenCalledWith('-2');
    expect(table.seats.filter((s) => s !== null).map((s) => s!.id)).toEqual(['human']);
  });

  it('is a no-op when there are no bots', async () => {
    const table = makeFakeTable([{ seat: 0, isBot: false, id: 'human' }]);
    wire(table);
    const { removed } = await removeBots('admin', 't');
    expect(removed).toBe(0);
    expect(table.removePlayer).not.toHaveBeenCalled();
  });
});
