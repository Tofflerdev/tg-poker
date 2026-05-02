import type { TelegramUser, UserProfile } from '../../types/index.js';

/**
 * In-memory user storage
 * Keyed by telegramId (stringified) — RESILIENCE-03
 * TODO: Replace with Redis/MongoDB in production
 */
class UserStorage {
  private users = new Map<string /* telegramId */, TelegramUser>();
  private profiles = new Map<number, UserProfile>(); // telegramId -> UserProfile

  /**
   * Get or create user profile
   */
  getOrCreateProfile(telegramId: number, username?: string): UserProfile {
    let profile = this.profiles.get(telegramId);

    if (!profile) {
      profile = {
        telegramId,
        username: username || `user_${telegramId}`,
        displayName: username || `Player ${telegramId}`,
        totalWinnings: 0,
        handsPlayed: 0,
        handsWon: 0,
        biggestPot: 0,
        joinedAt: new Date().toISOString(),
      };
      this.profiles.set(telegramId, profile);
    }

    return profile;
  }

  /**
   * Update user profile stats
   */
  updateProfileStats(
    telegramId: number,
    stats: Partial<Omit<UserProfile, 'telegramId' | 'username' | 'joinedAt'>>
  ): UserProfile | null {
    const profile = this.profiles.get(telegramId);

    if (!profile) {
      return null;
    }

    Object.assign(profile, stats);
    return profile;
  }

  /**
   * Add / refresh user — keyed by telegramId string
   */
  addUser(telegramId: string, user: TelegramUser): void {
    this.users.set(telegramId, user);

    // Ensure profile exists
    this.getOrCreateProfile(user.telegramId, user.username);
  }

  /**
   * Remove user by telegramId string
   */
  removeUser(telegramId: string): void {
    this.users.delete(telegramId);
  }

  /**
   * Get user by telegramId string
   */
  getUser(telegramId: string): TelegramUser | undefined {
    return this.users.get(telegramId);
  }

  /**
   * Get user profile by telegram ID
   */
  getProfile(telegramId: number): UserProfile | undefined {
    return this.profiles.get(telegramId);
  }

  /**
   * Update user balance by telegramId string
   */
  updateBalance(telegramId: string, delta: number): number | null {
    const user = this.users.get(telegramId);
    if (!user) return null;

    user.balance += delta;
    return user.balance;
  }

  /**
   * Get all connected users count
   */
  getConnectedCount(): number {
    return this.users.size;
  }

  /**
   * Get all profiles (for admin)
   */
  getAllProfiles(): UserProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Phase 5 / Plan 05-04 / ADMIN-04:
   * Get all authenticated users (for buildAdminState snapshot).
   * Returns all TelegramUser objects currently in the in-memory store.
   */
  getAllUsers(): TelegramUser[] {
    return Array.from(this.users.values());
  }
}


export const userStorage = new UserStorage();
export default userStorage;
