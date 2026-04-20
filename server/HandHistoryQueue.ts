import { HandHistoryRepository, type HandHistoryWriteRow } from './db/HandHistoryRepository.js';

/**
 * Phase 3 / Plan 03-02: In-process async batched writer for HandHistory.
 *
 * Decisions:
 * - D-10: in-process memory queue, no external worker
 * - D-11: flush every 1 s OR at 50 rows; createMany({skipDuplicates: true})
 * - D-12: retry 3× with 100 ms / 500 ms backoff, then drop + log
 * - D-13: singleton; exports enqueue() + shutdown() + start helpers
 *
 * SECURITY (T-3-DOS): On persistent DB outage the buffer cannot grow
 * unbounded — failed batches are DROPPED after 3 attempts, not retained.
 * Memory pressure is bounded by the flush cadence (1 s) and burst cap (50).
 */

const FLUSH_INTERVAL_MS = 1000;
const FLUSH_THRESHOLD = 50;
const RETRY_DELAYS_MS = [100, 500];
const RETENTION_DAYS = 90;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

let buffer: HandHistoryWriteRow[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let retentionTimer: NodeJS.Timeout | null = null;
let retentionBootTimer: NodeJS.Timeout | null = null;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function flushWithRetry(batch: HandHistoryWriteRow[], attempt = 0): Promise<void> {
  try {
    await HandHistoryRepository.createMany(batch);
  } catch (err) {
    if (attempt < RETRY_DELAYS_MS.length) {
      await delay(RETRY_DELAYS_MS[attempt]);
      return flushWithRetry(batch, attempt + 1);
    }
    console.error(
      '[HandHistoryQueue] dropping batch after 3 attempts. handIds:',
      batch.map((r) => r.handId),
      'error:',
      err
    );
  }
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  // Splice BEFORE write (D-12 / RESEARCH §"splice before write"): a crash
  // between splice and write loses at most one batch — acceptable for
  // best-effort visual history. The alternative (splice after success)
  // risks double-insertion on retry.
  const batch = buffer.splice(0, buffer.length);
  await flushWithRetry(batch, 0);
}

export function enqueue(row: HandHistoryWriteRow): void {
  buffer.push(row);
  if (buffer.length >= FLUSH_THRESHOLD) {
    void flush();
  }
}

export function startFlushTimer(): void {
  if (flushTimer) return; // idempotent — guards against double-registration
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
}

export async function shutdown(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (buffer.length > 0) {
    const batch = buffer.splice(0, buffer.length);
    await flushWithRetry(batch, 0);
  }
}

async function runRetentionSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  try {
    const result = await HandHistoryRepository.deleteOlderThan(cutoff);
    console.log(
      `[RetentionJob] deleted ${result.count} HandHistory rows older than ${cutoff.toISOString()}`
    );
  } catch (err) {
    console.error('[RetentionJob] sweep failed:', err);
  }
}

export function startRetentionJob(): void {
  // Idempotency guard: if either the boot timer OR the interval is already
  // registered, this call is a no-op. retentionBootTimer is non-null from
  // first call until the boot sweep fires; retentionTimer is non-null
  // thereafter.
  if (retentionBootTimer || retentionTimer) return;
  // Boot-time immediate sweep via setTimeout(0).  The recurring setInterval is
  // registered INSIDE the callback so that fake-timer tests using
  // runOnlyPendingTimersAsync only see one pending timer at a time and can
  // precisely control sequencing.
  retentionBootTimer = setTimeout(() => {
    retentionBootTimer = null;
    void runRetentionSweep();
    retentionTimer = setInterval(() => {
      void runRetentionSweep();
    }, RETENTION_INTERVAL_MS);
  }, 0);
}

/** Test-only: reset module state between Vitest cases. */
export function __resetForTests(): void {
  if (flushTimer) clearInterval(flushTimer);
  if (retentionTimer) clearInterval(retentionTimer);
  if (retentionBootTimer) clearTimeout(retentionBootTimer);
  flushTimer = null;
  retentionTimer = null;
  retentionBootTimer = null;
  buffer = [];
}

/** Test-only: read internal state for assertions. */
export function __getInternalsForTests() {
  return { buffer, flushTimer, retentionTimer };
}
