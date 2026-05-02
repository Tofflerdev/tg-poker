import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('adminNamespace middleware', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-please-do-not-leak';
    vi.resetModules();
  });

  it('rejects connection with no auth.token', async () => {
    const { adminNamespaceMiddleware } = await import('../admin/adminNamespace.js');
    const fakeSocket: any = { handshake: { auth: {} }, data: {} };
    const next = vi.fn();
    adminNamespaceMiddleware(fakeSocket, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('UNAUTHORIZED');
  });

  it('rejects connection with malformed token', async () => {
    const { adminNamespaceMiddleware } = await import('../admin/adminNamespace.js');
    const fakeSocket: any = { handshake: { auth: { token: 'not.a.real.jwt' } }, data: {} };
    const next = vi.fn();
    adminNamespaceMiddleware(fakeSocket, next);
    expect(next.mock.calls[0][0].message).toBe('UNAUTHORIZED');
  });

  it('admits connection with valid token and stamps socket.data.adminUser', async () => {
    const { signAdminToken } = await import('../admin/adminAuth.js');
    const { adminNamespaceMiddleware } = await import('../admin/adminNamespace.js');
    const token = signAdminToken('admin');
    const fakeSocket: any = { handshake: { auth: { token } }, data: {} };
    const next = vi.fn();
    adminNamespaceMiddleware(fakeSocket, next);
    expect(next).toHaveBeenCalledWith(); // no-arg = success
    expect(fakeSocket.data.adminUser).toBe('admin');
  });
});
