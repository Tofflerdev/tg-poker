import { describe, it, expect, beforeEach } from 'vitest';
import { userStorage } from '../models/User.js';
import type { TelegramUser } from '../../types/index.js';

/**
 * Regression: a deposit credited outside a socket handler (Crypto Pay webhook or
 * the reconciliation sweep) writes the User row and pushes the new balance to the
 * client — but the in-memory session copy was only ever written at auth. The
 * joinTable buy-in pre-check reads that copy, so a player who had just topped up
 * was told "Insufficient balance" over a balance the UI correctly showed as
 * sufficient, and only an app restart (a fresh auth) cleared it.
 *
 * setBalance is the sync point every out-of-band money path now calls.
 */
describe('userStorage.setBalance — session balance cache', () => {
  const TID = '4242';
  const makeUser = (balance: number) =>
    ({ telegramId: 4242, username: 'u', displayName: 'U', balance } as unknown as TelegramUser);

  beforeEach(() => {
    userStorage.removeUser(TID);
  });

  it('overwrites the cached balance so a post-deposit buy-in check sees the credit', () => {
    userStorage.addUser(TID, makeUser(100));
    // Webhook credits 5000 chips in the DB; the session copy must follow.
    userStorage.setBalance(TID, 5100);
    expect(userStorage.getUser(TID)!.balance).toBe(5100);
  });

  it('overwrites downward too (withdrawal hold), never merely increases', () => {
    userStorage.addUser(TID, makeUser(5100));
    userStorage.setBalance(TID, 100);
    expect(userStorage.getUser(TID)!.balance).toBe(100);
  });

  it('is a no-op for a telegramId with no live session', () => {
    expect(() => userStorage.setBalance('no-such-user', 999)).not.toThrow();
    expect(userStorage.getUser('no-such-user')).toBeUndefined();
  });
});
