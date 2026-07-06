/**
 * Lightweight in-memory fixed-window rate limiter (audit #11).
 *
 * No external dependency — keeps the prod Docker image and supply chain lean.
 * Keyed by an arbitrary string (IP for HTTP login, telegramId/socketId for
 * socket events). Not distributed; fine for a single-process server.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Returns true if the action is allowed; false if `key` exceeded `max` within the window. */
  take(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now >= entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    return true;
  }

  /** Drop expired entries so the map doesn't grow unbounded. Call periodically. */
  sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now >= entry.resetAt) this.hits.delete(key);
    }
  }

  /** Test-only: clear all state. */
  reset(): void {
    this.hits.clear();
  }
}
