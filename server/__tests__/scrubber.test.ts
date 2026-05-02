import { describe, it, expect } from 'vitest';
import { scrubObject, scrubSentryEvent } from '../utils/scrubber.js';

describe('scrubber', () => {
  it('redacts initData / sessionToken / telegramId field names case-insensitively', () => {
    const input = { initData: 'secret', sessionToken: 'jwt', Telegram_Id: 12345, normal: 'keep' };
    const out = scrubObject(input);
    expect(out.initData).toBe('[REDACTED]');
    expect(out.sessionToken).toBe('[REDACTED]');
    expect(out.Telegram_Id).toBe('[REDACTED]');
    expect(out.normal).toBe('keep');
  });

  it('redacts 6-12 digit numeric runs in string values', () => {
    const out = scrubObject({ note: 'user 123456789 logged in' });
    expect(out.note).toBe('user [REDACTED] logged in');
  });

  it('recurses into nested objects', () => {
    const out = scrubObject({ event: { user: { initData: 'x' } } });
    expect((out.event as any).user.initData).toBe('[REDACTED]');
  });

  it('scrubSentryEvent passes through scrubObject', () => {
    const ev = { contexts: { user: { telegram_id: 999888777 } } };
    const cleaned = scrubSentryEvent(ev);
    expect((cleaned.contexts as any).user.telegram_id).toBe('[REDACTED]');
  });
});
