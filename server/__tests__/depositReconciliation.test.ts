import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * crypto-payments-rake phase 4 §D: the deposit reconciliation sweep.
 *
 * The webhook is the only push path for a credit, so a payment made while the
 * server was down would otherwise strand a `pending` row forever — money taken,
 * chips never granted. These tests pin the pull path that rescues it, and prove
 * it cannot double-credit alongside a (late) webhook.
 *
 * Same in-memory prisma fake as depositCredit.test.ts, extended with findMany so
 * pending rows can be listed.
 */
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
        const row = { id, status: 'completed', createdAt: new Date(), ...data };
        db.txRows.set(id, row);
        return row;
      },
      findUnique: async ({ where }: any) => {
        if (where.externalId !== undefined) return rowByExternal(where.externalId);
        if (where.id !== undefined) return db.txRows.get(where.id) ?? null;
        return null;
      },
      findMany: async ({ where, take }: any) => {
        const rows = [...db.txRows.values()].filter(
          (r) => r.type === where.type && r.status === where.status && r.externalId != null,
        );
        return rows.slice(0, take ?? rows.length).map((r) => ({
          externalId: r.externalId,
          amount: r.amount,
          createdAt: r.createdAt ?? new Date(),
          user: db.users.get(r.userId)
            ? { telegramId: db.users.get(r.userId)!.telegramId }
            : null,
        }));
      },
      updateMany: async ({ where, data }: any) => {
        const row = db.txRows.get(where.id);
        if (!row) return { count: 0 };
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
import { reconcilePendingDeposits } from '../payments/depositReconciliation.js';

const INVOICE = '885777';

/** Crypto Pay client double: answers getInvoicesByIds from a canned list. */
function makeClient(items: any[]) {
  return {
    getInvoicesByIds: vi.fn(async (ids: string[]) =>
      items.filter((i) => ids.includes(String(i.invoice_id))),
    ),
  } as any;
}

const paidInvoice = (overrides: Record<string, unknown> = {}) => ({
  invoice_id: Number(INVOICE),
  status: 'paid',
  paid_amount: '50',
  fee_amount: '1.5',
  paid_asset: 'USDT',
  ...overrides,
});

describe('deposit reconciliation', () => {
  beforeEach(() => {
    db.users.clear();
    db.txRows.clear();
    db.seq = 0;
    db.users.set(1, { id: 1, telegramId: 555, balance: 0 });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  const rowFor = (invoiceId: string) =>
    [...db.txRows.values()].find((r) => r.externalId === invoiceId);

  it('rescues a paid deposit whose webhook never arrived', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);
    const notified: any[] = [];

    const res = await reconcilePendingDeposits(makeClient([paidInvoice()]), (o) => {
      notified.push(o);
    });

    // 50 USDT paid, 1.5 fee → 4850 chips, exactly as the webhook would credit.
    expect(res).toMatchObject({ checked: 1, credited: 1, expired: 0 });
    expect(db.users.get(1)!.balance).toBe(4850);
    expect(rowFor(INVOICE)).toMatchObject({ status: 'completed', amount: 4850, balanceAfter: 4850 });
    expect(notified).toEqual([
      { invoiceId: INVOICE, telegramId: 555, creditedChips: 4850, balance: 4850 },
    ]);
    // Marked so a human can tell a rescued credit from a live one.
    expect((rowFor(INVOICE)!.meta as any).creditedBy).toBe('reconciliation');
  });

  it('never double-credits when it runs again (or a late webhook lands)', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);
    const client = makeClient([paidInvoice()]);

    await reconcilePendingDeposits(client);
    const second = await reconcilePendingDeposits(client);

    expect(db.users.get(1)!.balance).toBe(4850); // still one credit
    expect(second).toMatchObject({ checked: 0, credited: 0 }); // nothing left pending
  });

  it('closes an expired invoice instead of leaving it pending forever', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);

    const res = await reconcilePendingDeposits(makeClient([paidInvoice({ status: 'expired' })]));

    expect(res).toMatchObject({ checked: 1, credited: 0, expired: 1 });
    expect(rowFor(INVOICE)).toMatchObject({ status: 'failed' });
    expect((rowFor(INVOICE)!.meta as any).note).toBe('invoice_expired');
    expect(db.users.get(1)!.balance).toBe(0);
  });

  it('leaves a still-payable invoice alone', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);

    const res = await reconcilePendingDeposits(makeClient([paidInvoice({ status: 'active' })]));

    expect(res).toMatchObject({ checked: 1, credited: 0, expired: 0, stillPending: 1 });
    expect(rowFor(INVOICE)).toMatchObject({ status: 'pending' });
  });

  it('never guesses about an invoice the provider does not report', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);

    const res = await reconcilePendingDeposits(makeClient([]));

    expect(res).toMatchObject({ checked: 1, unknown: 1, credited: 0 });
    expect(rowFor(INVOICE)).toMatchObject({ status: 'pending' }); // untouched
  });

  it('survives a provider outage without throwing or touching rows', async () => {
    await UserRepository.createPendingDeposit(555, 5000, INVOICE);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = { getInvoicesByIds: vi.fn(async () => { throw new Error('503'); }) } as any;

    const res = await reconcilePendingDeposits(client);

    expect(res).toMatchObject({ credited: 0, expired: 0 });
    expect(rowFor(INVOICE)).toMatchObject({ status: 'pending' });
    expect(db.users.get(1)!.balance).toBe(0);
  });

  it('does nothing when there is nothing pending', async () => {
    const client = makeClient([paidInvoice()]);
    const res = await reconcilePendingDeposits(client);
    expect(res).toMatchObject({ checked: 0 });
    expect(client.getInvoicesByIds).not.toHaveBeenCalled();
  });
});
