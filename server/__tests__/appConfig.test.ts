import { describe, it, expect, afterEach } from 'vitest';
import { getMiniAppUrl } from '../config/app.js';

/**
 * The bot link changes when the production bot replaces the test one, so it
 * must come from config, never from code.
 */
const KEYS = ['BOT_USERNAME', 'MINI_APP_URL'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('mini app link config', () => {
  it('builds a t.me link from the bot username', () => {
    process.env.BOT_USERNAME = 'Testpoke_bot';
    delete process.env.MINI_APP_URL;
    expect(getMiniAppUrl()).toBe('https://t.me/Testpoke_bot');
  });

  it('tolerates a leading @ in the username', () => {
    process.env.BOT_USERNAME = '@Testpoke_bot';
    delete process.env.MINI_APP_URL;
    expect(getMiniAppUrl()).toBe('https://t.me/Testpoke_bot');
  });

  it('lets an explicit URL win, for deep links into the mini app', () => {
    process.env.BOT_USERNAME = 'Testpoke_bot';
    process.env.MINI_APP_URL = 'https://t.me/Other_bot/app?startapp=deposit';
    expect(getMiniAppUrl()).toBe('https://t.me/Other_bot/app?startapp=deposit');
  });

  it('returns null when nothing is configured, so callers can omit the button', () => {
    delete process.env.BOT_USERNAME;
    delete process.env.MINI_APP_URL;
    expect(getMiniAppUrl()).toBeNull();
  });

  it('treats blank values as unset', () => {
    process.env.BOT_USERNAME = '   ';
    process.env.MINI_APP_URL = '';
    expect(getMiniAppUrl()).toBeNull();
  });
});
