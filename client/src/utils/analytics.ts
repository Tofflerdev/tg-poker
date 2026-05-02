import posthog from 'posthog-js';
import type { TrackableEvent } from '../../../types/index';

/**
 * Phase 5 / Plan 05-02 / OBS-03 / OBS-04 / D-11 / D-12.
 *
 * Client-side analytics surface.
 *   - track(event, properties?) — capture event under the currently identified
 *     analyticsId (set via identifyAnalytics on authSuccess).
 *   - identifyAnalytics(analyticsId) — called once per session from App.tsx.
 *
 * No-op when posthog was not initialized (VITE_POSTHOG_API_KEY absent).
 * posthog-js fires capture/identify lazily; calls before init() are buffered
 * but in our setup we only call these AFTER the env-guarded init in index.tsx.
 */

let _identified = false;

export function track(event: TrackableEvent, properties?: Record<string, unknown>): void {
  // posthog.capture is a no-op if posthog.init was never called; safe to call always.
  posthog.capture(event, properties);
}

export function identifyAnalytics(analyticsId: string): void {
  if (_identified) return;
  _identified = true;
  posthog.identify(analyticsId);
}
