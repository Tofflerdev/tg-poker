import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * crypto-payments-rake phase 4 §D/§E: unit-test the deposit credit path
 * (createPendingDeposit + creditDepositIfPending) against an in-memory fake
 * prisma that models the guarded `pending → completed` status transition — the
 * exact mechanism that makes duplicate webhook deliveries idempotent.
 */

// A tiny in-memory DB shared by the mocked prisma client. vi.hoisted so the
// vi.mock factory (hoisted above imports) can capture it.
const db = vi.hoisted(() => ({
  users: new Map<number, { id: number; telegramId: number; balance: number }>(),
  txRows: new Map<string, any>(),
  seq: 0,
}));

vi.mock('../db/prisma.js', () => {
  const rowByExternal = (externalId: string) =>
    [...db.txRows.values()].find((r) => r.externalId === externalId) ?? null;

  const client: any = {
    user: {
      findUnique: async ({ where, select }: any) => {
        const u =
          where.id !== undefined
            ? db.users.get(where.id)
            : [...db.users.values()].find((x) => x.telegramId === Number(where.telegramId));
        if (!u) return null;
        return select ? pick(u, select) : { ...u };
      },
      update: async ({ where, data, select }: any) => {
        const u = db.users.get(where.id)!;
        if (data.balance?.increment !== undefined) u.balance += data.balance.increment;
        return select ? pick(u, select) : { ...u };
      },
    },
    transaction: {
      create: async ({ data }: any) => {
        const id = `tx${++db.seq}`;
        const row = { id, status: 'completed', ...data };
        db.txRows.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        if (where.externalId !== undefined) return rowByExternal(where.externalId);
        if (where.id !== undefined) return db.txRows.get(where.id) ?? null;
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = db.txRows.get(where.id);
        if (!row) return { count: 0 };
        // Guard: only match when the current status equals the required one.
        if (where.status !== undefined && row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => {
        const row = db.txRows.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    // Interactive transaction: run the callback with the same client (single-threaded
    // test — the guarded updateMany models the concurrency-safe status flip).
    $transaction: async (fn: any) => fn(client),
  };
  return { default: client };
});

function pick(obj: any, select: Record<string, boolean>) {
  const out: any = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = obj[k];
  return out;
}

import { UserRepository } from '../db/UserRepository.js';

const INVOICE = 'inv-123';

describe('deposit credit (§D/§E)', () => {
  beforeEach(() => {
    db.users.clear();
    db.txRows.clear();
    db.seq = 0;
    db.users.set(1, { id: 1, telegramId: 555, balance: 0 });
  });

  async function seedPending(chips: number) {
    await UserRepository.createPendingDeposit(555, chips, INVOICE);
  }

  it('createPendingDeposit writes a pending, uncredited row keyed by invoiceId', async () => {
    await seedPending(1000);
    const row = [...db.txRows.values()].find((r) => r.externalId === INVOICE);
    expect(row).toMatchObject({ type: 'deposit', status: 'pending', amount: 1000, balanceAfter: null, userId: 1 });
    expect(db.users.get(1)!.balance).toBe(0); // not credited yet
  });

  it('credits the net amount once and marks the row completed', async () => {
    await seedPending(1000);
    const res = await UserRepository.creditDepositIfPending(INVOICE, 995, { fee: '0.05' });
    expect(res).toMatchObject({ credited: true, telegramId: 555, balance: 995, creditedChips: 995 });
    const row = [...db.txRows.values()].find((r) => r.externalId === INVOICE);
    expect(row.status).toBe('completed');
    expect(row.amount).toBe(995); // finalized to the net credit
    expect(row.balanceAfter).toBe(995);
    expect(db.users.get(1)!.balance).toBe(995);
  });

  it('is idempotent: a duplicate delivery does NOT double-credit', async () => {
    await seedPending(1000);
    const first = await UserRepository.creditDepositIfPending(INVOICE, 995, {});
    const second = await UserRepository.creditDepositIfPending(INVOICE, 995, {});
    expect(first.credited).toBe(true);
    expect(second).toMatchObject({ credited: false, reason: 'already_credited' });
    expect(db.users.get(1)!.balance).toBe(995); // credited exactly once
  });

  it('ignores an unknown invoice', async () => {
    const res = await UserRepository.creditDepositIfPending('nope', 500, {});
    expect(res).toMatchObject({ credited: false, reason: 'unknown_invoice' });
  });

  it('marks the row failed and credits nothing when net <= 0', async () => {
    await seedPending(1000);
    const res = await UserRepository.creditDepositIfPending(INVOICE, 0, { fee: '10' });
    expect(res).toMatchObject({ credited: false, reason: 'net_zero' });
    const row = [...db.txRows.values()].find((r) => r.externalId === INVOICE);
    expect(row.status).toBe('failed');
    expect(db.users.get(1)!.balance).toBe(0);
  });
});
