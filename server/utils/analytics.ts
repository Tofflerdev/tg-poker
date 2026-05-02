import crypto from 'crypto';
import type { PostHog } from 'posthog-node';
import type { TrackableEvent } from '../../types/index.js';

/**
 * Phase 5 / Plan 05-02 / OBS-03 / OBS-04 / D-09 / D-11 / D-12.
 *
 * Server-side analytics surface. Decoupled from PostHog instantiation so:
 *   - boot code in server/index.ts owns the env-var guard (D-09 graceful no-op)
 *   - this module exposes a flat track() that accepts only TrackableEvent
 *   - analyticsId is computed via toAnalyticsId(telegramId) and is the only
 *     identity that ever reaches PostHog (D-12; raw telegramId never leaves the
 *     server for analytics purposes)
 */

let _posthog: PostHog | null = null;

export function initAnalytics(client: PostHog): void {
  _posthog = client;
}

export function track(
  analyticsId: string,
  event: TrackableEvent,
  properties?: Record<string, unknown>
): void {
  if (!_posthog) return;
  _posthog.capture({ distinctId: analyticsId, event, properties });
}

export function toAnalyticsId(telegramId: number | string): string {
  const id = typeof telegramId === 'number' ? telegramId.toString() : telegramId;
  return crypto.createHash('sha256').update(id).digest('hex');
}

/**
 * Pitfall 6 (RESEARCH): posthog-node batches events. Without a clean shutdown,
 * the last batch may be dropped on process exit. Call from SIGTERM / SIGINT.
 */
export async function shutdownAnalytics(): Promise<void> {
  if (!_posthog) return;
  await _posthog.shutdown();
  _posthog = null;
}
