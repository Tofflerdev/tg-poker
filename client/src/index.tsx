import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';
import { scrubSentryEvent } from './utils/scrubber';
import App from "./App";

// Phase 5 / Plan 05-02 / OBS-01 / OBS-02 / D-09: Sentry init with Replay (privacy-masked).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as any,
  });
}

// Phase 5 / Plan 05-02 / OBS-03 / D-09: PostHog client init guarded.
if (import.meta.env.VITE_POSTHOG_API_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_API_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: false,
  });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
