/**
 * Phase 5 / Plan 05-02 / SECURITY-04 / D-10.
 *
 * PII scrubber shared by Sentry beforeSend (server + client copies — see
 * client/src/utils/scrubber.ts for the duplicate; client cannot import server
 * paths). Strips:
 *   - field NAMES matching /telegram_id|initdata|session_?token/i
 *   - 6-12 digit numeric runs in string VALUES (covers all Telegram IDs)
 *
 * Pure function: no Node-specific imports; safe to copy verbatim to the client.
 */

const PII_FIELD_RE = /telegram_?id|initdata|session_?token/i;
const TELEGRAM_ID_RE = /\b\d{6,12}\b/g;

export function scrubObject<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_FIELD_RE.test(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v.replace(TELEGRAM_ID_RE, '[REDACTED]');
      continue;
    }
    if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' ? scrubObject(item as Record<string, unknown>) : item
      );
      continue;
    }
    if (v && typeof v === 'object') {
      out[k] = scrubObject(v as Record<string, unknown>);
      continue;
    }
    out[k] = v;
  }
  return out as T;
}

export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return scrubObject(event);
}
