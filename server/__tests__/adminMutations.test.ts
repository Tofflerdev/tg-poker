import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db/prisma.js', () => ({
  default: {
    adminAuditLog: { create: vi.fn() },
    user: { update: vi.fn(), findUnique: vi.fn() },
  },
}));

describe('adminMutations fire-and-fail audit pattern', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('writes audit row BEFORE running the mutation (audit.create called before mutation fn)', async () => {
    const prisma = (await import('../db/prisma.js')).default as any;
    const order: string[] = [];
    prisma.adminAuditLog.create.mockImplementation(async () => { order.push('audit'); return { id: 'a1' }; });
    const { runWithAudit } = await import('../admin/adminMutations.js');
    const mutation = vi.fn(async () => { order.push('mutation'); });
    await runWithAudit(
      { adminUser: 'admin', action: 'kick', targetType: 'user', targetId: '123', beforeJson: null, afterJson: null },
      mutation
    );
    expect(order).toEqual(['audit', 'mutation']);
  });

  it('aborts mutation when audit write throws', async () => {
    const prisma = (await import('../db/prisma.js')).default as any;
    prisma.adminAuditLog.create.mockRejectedValue(new Error('db down'));
    const { runWithAudit } = await import('../admin/adminMutations.js');
    const mutation = vi.fn();
    await expect(runWithAudit(
      { adminUser: 'admin', action: 'kick', targetType: 'user', targetId: '123', beforeJson: null, afterJson: null },
      mutation
    )).rejects.toThrow('db down');
    expect(mutation).not.toHaveBeenCalled();
  });
});
