import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('joinTable ToS gate', () => {
  beforeEach(() => { vi.resetModules(); });

  it('gateUserOrEmit returns "TOS_REQUIRED" when tosAcceptedAt is null', async () => {
    const { gateUserOrEmit } = await import('../middleware/joinGate.js');
    const fakeUser = { telegramId: 1, tosAcceptedAt: undefined, bannedAt: undefined };
    const emitted: Array<{ type: string }> = [];
    const fakeSocket: any = { emit: (_evt: string, payload: any) => emitted.push(payload) };
    const ok = gateUserOrEmit(fakeUser as any, fakeSocket);
    expect(ok).toBe(false);
    expect(emitted).toContainEqual({ type: 'TOS_REQUIRED' });
  });

  it('gateUserOrEmit returns "BANNED" when bannedAt is set', async () => {
    const { gateUserOrEmit } = await import('../middleware/joinGate.js');
    const fakeUser = { telegramId: 1, tosAcceptedAt: new Date().toISOString(), bannedAt: new Date().toISOString() };
    const emitted: Array<{ type: string }> = [];
    const fakeSocket: any = { emit: (_evt: string, payload: any) => emitted.push(payload) };
    const ok = gateUserOrEmit(fakeUser as any, fakeSocket);
    expect(ok).toBe(false);
    expect(emitted).toContainEqual({ type: 'BANNED' });
  });

  it('gateUserOrEmit returns true for accepted-and-not-banned user', async () => {
    const { gateUserOrEmit } = await import('../middleware/joinGate.js');
    const fakeUser = { telegramId: 1, tosAcceptedAt: new Date().toISOString(), bannedAt: undefined };
    const emitted: any[] = [];
    const fakeSocket: any = { emit: (_evt: string, payload: any) => emitted.push(payload) };
    const ok = gateUserOrEmit(fakeUser as any, fakeSocket);
    expect(ok).toBe(true);
    expect(emitted).toEqual([]);
  });
});
