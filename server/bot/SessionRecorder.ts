import fs from 'fs';
import path from 'path';
import type { PlayerActionEvent, HandCompleteEvent } from '../../types/index.js';

/**
 * SessionRecorder — appends playtest game events to a JSONL session file.
 *
 * Reuses the EXISTING event types (PlayerActionEvent / HandCompleteEvent) — no
 * new schema. Each line is a tagged envelope so the replay/oracle layer can tell
 * action lines from hand-complete lines:
 *   { "ts": <epoch ms>, "kind": "action", "e": PlayerActionEvent }
 *   { "ts": <epoch ms>, "kind": "hand",   "e": HandCompleteEvent }
 *
 * HandCompleteEvent carries RAW hole cards for every seat (this is local
 * analysis data, written before any broadcast redaction), which the oracle
 * needs to independently recompute winners.
 *
 * Gated by an explicit flag (RECORD_SESSIONS) so it is a no-op in normal
 * operation and in tests. One file per process run, created lazily on the first
 * event so a disabled/idle server never touches the filesystem.
 */
export type RecordedLine =
  | { ts: number; kind: 'action'; e: PlayerActionEvent }
  | { ts: number; kind: 'hand'; e: HandCompleteEvent };

export function serializeAction(e: PlayerActionEvent, ts: number): string {
  return JSON.stringify({ ts, kind: 'action', e } satisfies RecordedLine);
}

export function serializeHand(e: HandCompleteEvent, ts: number): string {
  return JSON.stringify({ ts, kind: 'hand', e } satisfies RecordedLine);
}

export interface SessionRecorderDeps {
  enabled: boolean;
  dir?: string;                    // default 'sessions'
  now?: () => number;              // default Date.now
  sink?: (line: string) => void;   // test override; bypasses fs
}

export class SessionRecorder {
  private readonly enabled: boolean;
  private readonly dir: string;
  private readonly now: () => number;
  private readonly sink?: (line: string) => void;
  private stream: fs.WriteStream | null = null;
  private filePath: string | null = null;

  constructor(deps: SessionRecorderDeps) {
    this.enabled = deps.enabled;
    this.dir = deps.dir ?? 'sessions';
    this.now = deps.now ?? Date.now;
    this.sink = deps.sink;
  }

  get isEnabled(): boolean { return this.enabled; }
  get path(): string | null { return this.filePath; }

  recordAction(e: PlayerActionEvent): void {
    if (!this.enabled) return;
    this.write(serializeAction(e, this.now()));
  }

  recordHandComplete(e: HandCompleteEvent): void {
    if (!this.enabled) return;
    this.write(serializeHand(e, this.now()));
  }

  private write(line: string): void {
    try {
      if (this.sink) {
        this.sink(line + '\n');
        return;
      }
      this.ensureStream();
      this.stream?.write(line + '\n');
    } catch (err) {
      // Recording is best-effort — never let it disturb the game loop.
      console.error('[SessionRecorder] write failed:', err);
    }
  }

  private ensureStream(): void {
    if (this.stream) return;
    fs.mkdirSync(this.dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(this.dir, `session-${stamp}.jsonl`);
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    console.log(`[SessionRecorder] recording session to ${this.filePath}`);
  }

  /** Flush + close the stream (call on graceful shutdown). */
  close(): Promise<void> {
    return new Promise((resolve) => {
      const s = this.stream;
      this.stream = null;
      if (!s) { resolve(); return; }
      s.end(() => resolve());
    });
  }
}
