import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ExtendedServerEvents,
  ExtendedClientEvents,
  GameStage,
} from '../../../types/index';

/**
 * Plan 04-05 / RESILIENCE-05 / D-B4:
 * Full-screen Neon Strip "Reconnecting…" overlay with 1500 ms debounce, stage-aware
 * countdown (30 s mid-hand / 120 s between-hands), and three terminal sub-views
 * (sat-out, vacated, replaced).
 *
 * The component is a pure consumer of socket lifecycle events:
 *   - 'disconnect' → start debounce timer
 *   - 'connect' → cancel debounce / dismiss active overlay
 *   - 'tableJoined' → dismiss (server pushed snapshot — D-A2)
 *   - 'replacedBySession' → instantly show replaced sub-view (D-A3)
 *
 * Pitfall 5 (rapid disconnect/connect flicker) is closed by tracking the
 * debounce timer in a useRef and clearing on every 'connect' event.
 *
 * Exports timing constants for the Wave-0 test (Plan 04-00) and for App.tsx
 * to reuse if it ever needs to compute the same numbers.
 */

export const RECONNECT_OVERLAY_DEBOUNCE_MS = 1500;
export const GRACE_MID_HAND_MS = 30_000;
export const GRACE_BETWEEN_HANDS_MS = 120_000;

export interface ReconnectOverlayProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  /** Last-known game stage at disconnect — used to infer mid-hand vs between-hands grace duration. */
  lastStage: GameStage;
  /** Optional callback for the "Back to Tables" button in expired sub-views. */
  onDismissExpired?: () => void;
}

type OverlayState =
  | { kind: 'hidden' }
  | { kind: 'reconnecting'; stage: 'mid-hand' | 'between-hands'; expiresAt: number }
  | { kind: 'sat-out' }
  | { kind: 'vacated' }
  | { kind: 'replaced' };

const stageFor = (lastStage: GameStage): 'mid-hand' | 'between-hands' =>
  lastStage === 'waiting' || lastStage === 'showdown' ? 'between-hands' : 'mid-hand';

export function ReconnectOverlay({ socket, lastStage, onDismissExpired }: ReconnectOverlayProps): JSX.Element | null {
  const [overlayState, setOverlayState] = useState<OverlayState>({ kind: 'hidden' });
  const [tickNow, setTickNow] = useState<number>(Date.now());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStageRef = useRef<GameStage>(lastStage);

  // Track lastStage in a ref so the debounce callback (closure-captured) reads the freshest value.
  useEffect(() => {
    lastStageRef.current = lastStage;
  }, [lastStage]);

  const clearAllTimers = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (graceRef.current) {
      clearTimeout(graceRef.current);
      graceRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onDisconnect = () => {
      // Pitfall 5: clear any prior debounce before starting a new one.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const stage = stageFor(lastStageRef.current);
        const graceMs = stage === 'mid-hand' ? GRACE_MID_HAND_MS : GRACE_BETWEEN_HANDS_MS;
        const startedAt = Date.now();
        const expiresAt = startedAt + graceMs;
        // Sync tickNow to the moment the overlay opens so the first render shows
        // the full graceMs (otherwise stale tickNow from initial mount makes the
        // countdown read graceMs+1500 ms — visible as "32" instead of "30").
        setTickNow(startedAt);
        setOverlayState({ kind: 'reconnecting', stage, expiresAt });
        // Start the grace expiry timer.
        if (graceRef.current) clearTimeout(graceRef.current);
        graceRef.current = setTimeout(() => {
          graceRef.current = null;
          setOverlayState(stage === 'mid-hand' ? { kind: 'sat-out' } : { kind: 'vacated' });
        }, graceMs);
        // Start the per-second tick for the visible countdown.
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = setInterval(() => {
          setTickNow(Date.now());
        }, 1000);
      }, RECONNECT_OVERLAY_DEBOUNCE_MS);
    };

    const onConnect = () => {
      // Cancel debounce + grace + tick. Hide overlay if reconnecting.
      clearAllTimers();
      setOverlayState((prev) => (prev.kind === 'reconnecting' ? { kind: 'hidden' } : prev));
    };

    const onTableJoined = () => {
      clearAllTimers();
      setOverlayState({ kind: 'hidden' });
    };

    const onReplacedBySession = () => {
      // D-A3: instantaneous eviction. Bypass debounce.
      clearAllTimers();
      setOverlayState({ kind: 'replaced' });
    };

    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    socket.on('tableJoined', onTableJoined);
    socket.on('replacedBySession', onReplacedBySession);

    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      socket.off('tableJoined', onTableJoined);
      socket.off('replacedBySession', onReplacedBySession);
      clearAllTimers();
    };
  }, [socket, clearAllTimers]);

  // Render
  if (overlayState.kind === 'hidden') return null;

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background: 'rgba(10,10,14,0.9)',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-active)',
    fontFamily: 'sans-serif',
    padding: '24px',
    textAlign: 'center',
  };

  if (overlayState.kind === 'reconnecting') {
    const remainingMs = Math.max(0, overlayState.expiresAt - tickNow);
    const remainingSec = Math.ceil(remainingMs / 1000);
    return (
      <div data-testid="reconnect-overlay" style={backdropStyle}>
        <div
          style={{
            color: 'var(--color-active)',
            textShadow: '0 0 12px var(--glow-call)',
            fontSize: 24,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          Reconnecting…
        </div>
        <div
          style={{
            color: 'var(--color-chip)',
            textShadow: '0 0 8px var(--glow-call)',
            fontFamily: 'monospace',
            fontSize: 36,
          }}
        >
          {remainingSec}
        </div>
        <div style={{ color: 'var(--color-neutral)', fontSize: 14, marginTop: 8 }}>
          {overlayState.stage === 'mid-hand' ? 'seconds — your turn is held' : 'seconds — your seat is held'}
        </div>
      </div>
    );
  }

  if (overlayState.kind === 'sat-out') {
    return (
      <div data-testid="reconnect-overlay-sat-out" style={backdropStyle}>
        <div style={{ color: 'var(--color-active)', textShadow: '0 0 12px var(--glow-call)', fontSize: 22, marginBottom: 8 }}>
          You were sat out
        </div>
        <div style={{ color: 'var(--color-neutral)', fontSize: 14, marginBottom: 24 }}>
          Your seat is held — sit in to resume.
        </div>
        <button
          type="button"
          onClick={onDismissExpired}
          style={{
            background: 'transparent',
            border: '1.5px solid var(--color-active)',
            color: 'var(--color-active)',
            padding: '12px 24px',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '0 0 8px var(--glow-call)',
          }}
        >
          Back to Tables
        </button>
      </div>
    );
  }

  if (overlayState.kind === 'vacated') {
    return (
      <div data-testid="reconnect-overlay-vacated" style={backdropStyle}>
        <div style={{ color: 'var(--color-action-fold)', textShadow: '0 0 12px var(--glow-fold)', fontSize: 22, marginBottom: 8 }}>
          Removed from table
        </div>
        <div style={{ color: 'var(--color-neutral)', fontSize: 14, marginBottom: 24 }}>
          Chips returned to balance.
        </div>
        <button
          type="button"
          onClick={onDismissExpired}
          style={{
            background: 'transparent',
            border: '1.5px solid var(--color-active)',
            color: 'var(--color-active)',
            padding: '12px 24px',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '0 0 8px var(--glow-call)',
          }}
        >
          Back to Tables
        </button>
      </div>
    );
  }

  // overlayState.kind === 'replaced'
  return (
    <div data-testid="reconnect-overlay-replaced" style={backdropStyle}>
      <div style={{ color: 'var(--color-action-fold)', textShadow: '0 0 12px var(--glow-fold)', fontSize: 22, marginBottom: 8 }}>
        Logged in elsewhere
      </div>
      <div style={{ color: 'var(--color-neutral)', fontSize: 14 }}>
        This session has been closed.
      </div>
    </div>
  );
}
