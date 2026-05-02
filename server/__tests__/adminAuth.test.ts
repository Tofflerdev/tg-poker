import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('adminAuth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-please-do-not-leak';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASS = 'hunter2';
    vi.resetModules();
  });

  it('signAdminToken returns a JWT that verifyAdminToken accepts', async () => {
    const mod = await import('../admin/adminAuth.js');
    const token = mod.signAdminToken('admin');
    const decoded = mod.verifyAdminToken(token);
    expect(decoded.username).toBe('admin');
  });

  it('verifyAdminToken throws on tampered tokens', async () => {
    const mod = await import('../admin/adminAuth.js');
    expect(() => mod.verifyAdminToken('not.a.real.jwt')).toThrow();
  });

  it('validateCredentials returns true only for matching ADMIN_USER + ADMIN_PASS', async () => {
    const mod = await import('../admin/adminAuth.js');
    expect(mod.validateCredentials('admin', 'hunter2')).toBe(true);
    expect(mod.validateCredentials('admin', 'wrong')).toBe(false);
    expect(mod.validateCredentials('other', 'hunter2')).toBe(false);
  });
});
