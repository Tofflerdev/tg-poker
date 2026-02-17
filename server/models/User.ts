import type { TelegramUser, UserProfile } from '../../types/index.js';

/**
 * In-memory user storage
 * TODO: Replace with Redis/MongoDB in production
 */
class UserStorage {
  private users = new Map<string, TelegramUser>(); // socketId -> TelegramUser
  private profiles = new Map<number, UserProfile>(); // telegramId -> UserProfile
  private socketToTelegram = new Map<string, number>(); // socketId -> telegramId

  /**
   * Get or create user profile
   */
  getOrCreateProfile(telegramId: number, username?: string): UserProfile {
    let profile = this.profiles.get(telegramId);
    
    if (!profile) {
      profile = {
        telegramId,
        username: username || `user_${telegramId}`,
        totalWinnings: 0,
        handsPlayed: 0,
        handsWon: 0,
        joinedAt: new Date(),
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
   * Add user connection
   */
  addUser(socketId: string, user: TelegramUser): void {
    this.users.set(socketId, user);
    this.socketToTelegram.set(socketId, user.telegramId);
    
    // Ensure profile exists
    this.getOrCreateProfile(user.telegramId, user.username);
  }

  /**
   * Remove user connection
   */
  removeUser(socketId: string): void {
    const telegramId = this.socketToTelegram.get(socketId);
    this.users.delete(socketId);
    this.socketToTelegram.delete(socketId);
  }

  /**
   * Get user by socket ID
   */
  getUser(socketId: string): TelegramUser | undefined {
    return this.users.get(socketId);
  }

  /**
   * Get user profile by telegram ID
   */
  getProfile(telegramId: number): UserProfile | undefined {
    return this.profiles.get(telegramId);
  }

  /**
   * Get user profile by socket ID
   */
  getProfileBySocket(socketId: string): UserProfile | undefined {
    const telegramId = this.socketToTelegram.get(socketId);
    if (!telegramId) return undefined;
    return this.profiles.get(telegramId);
  }

  /**
   * Update user balance
   */
  updateBalance(socketId: string, delta: number): number | null {
    const user = this.users.get(socketId);
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
}

export const userStorage = new UserStorage();
export default userStorage;
