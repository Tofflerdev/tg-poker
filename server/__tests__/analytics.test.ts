import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('analytics', () => {
  beforeEach(() => { vi.resetModules(); });

  it('track() is a no-op when initAnalytics has not been called (POSTHOG_API_KEY absent path)', async () => {
    const mod = await import('../utils/analytics.js');
    // Should not throw, should return void.
    expect(() => mod.track('hash-abc', 'table_joined', { tableId: 't1' })).not.toThrow();
  });

  it('track() forwards to posthog.capture when initAnalytics has been called', async () => {
    const captured: any[] = [];
    const fakePosthog = { capture: (args: any) => captured.push(args) } as any;
    const mod = await import('../utils/analytics.js');
    mod.initAnalytics(fakePosthog);
    mod.track('hash-abc', 'table_joined', { tableId: 't1' });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ distinctId: 'hash-abc', event: 'table_joined', properties: { tableId: 't1' } });
  });
});
