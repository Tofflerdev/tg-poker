import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { ExtendedServerEvents, ExtendedClientEvents } from '../../../types/index';

/**
 * exit-reconnect D: full-screen Neon Strip "Reconnecting…" overlay.
 *
 * Reworked from the two-stage design (30 s mid-hand / 120 s between-hands inferred
 * from the last known GameStage). The server now holds the seat for ONE window and
 * ships its length in tableJoined, so the client no longer guesses either the
 * duration or the stage — it just counts the server's number down from its own
 * 'disconnect' event. A duration, not a deadline: nothing to clock-sync.
 *
 * Sub-views:
 *   - reconnecting  — counting down, with a manual reload as the escape hatch
 *   - vacated       — window ran out; the seat was cashed out while away
 *   - replaced      — logged in elsewhere (D-A3, instantaneous, bypasses debounce)
 *
 * The old 'sat-out' terminal view is gone: returning inside the window puts the
 * player straight back at the table (the server re-seats them on auth), so there is
 * nothing to dismiss. Sitting out is now an invisible chip-protection step, not a
 * dead end the player has to click out of.
 *
 * Pure consumer of socket lifecycle events:
 *   'disconnect' → debounce, then show     'connect' → dismiss
 *   'tableJoined' → dismiss (server pushed a snapshot — D-A2)
 *   'replacedBySession' → replaced view
 *
 * Pitfall 5 (rapid disconnect/connect flicker) is closed by the debounce ref.
 */

export const RECONNECT_OVERLAY_DEBOUNCE_MS = 1500;
/** Fallback when the server hasn't told us yet (not seated → seat-holding is moot). */
export const DEFAULT_RECONNECT_WINDOW_MS = 120_000;

export interface ReconnectOverlayProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  /** Seat-holding window from the server's tableJoined; null until seated. */
  reconnectWindowMs?: number | null;
  /** Callback for the "Back to Tables" button in the vacated sub-view. */
  onDismissExpired?: () => void;
}

type OverlayState =
  | { kind: 'hidden' }
  | { kind: 'reconnecting'; expiresAt: number }
  | { kind: 'vacated' }
  | { kind: 'replaced' };

export function ReconnectOverlay({
  socket,
  reconnectWindowMs,
  onDismissExpired,
}: ReconnectOverlayProps): JSX.Element | null {
  const [overlayState, setOverlayState] = useState<OverlayState>({ kind: 'hidden' });
  const [tickNow, setTickNow] = useState<number>(Date.now());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read the freshest window from the closure-captured disconnect callback.
  const windowRef = useRef<number>(reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS);

  useEffect(() => {
    windowRef.current = reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS;
  }, [reconnectWindowMs]);

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
        const graceMs = windowRef.current;
        const startedAt = Date.now();
        // Sync tickNow to the moment the overlay opens so the first render shows the
        // full graceMs (a stale tickNow reads graceMs+1500 — "122" instead of "120").
        setTickNow(startedAt);
        setOverlayState({ kind: 'reconnecting', expiresAt: startedAt + graceMs });

        if (graceRef.current) clearTimeout(graceRef.current);
        graceRef.current = setTimeout(() => {
          graceRef.current = null;
          setOverlayState({ kind: 'vacated' });
        }, graceMs);

        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = setInterval(() => setTickNow(Date.now()), 1000);
      }, RECONNECT_OVERLAY_DEBOUNCE_MS);
    };

    const onConnect = () => {
      // The transport is back. App.tsx re-authenticates on this same event, which is
      // what actually restores the session and the seat.
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

  const buttonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1.5px solid var(--color-active)',
    color: 'var(--color-active)',
    padding: '12px 24px',
    borderRadius: 12,
    minHeight: 44,
    cursor: 'pointer',
    boxShadow: '0 0 8px var(--glow-call)',
  };

  if (overlayState.kind === 'reconnecting') {
    const remainingSec = Math.ceil(Math.max(0, overlayState.expiresAt - tickNow) / 1000);
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
        <div style={{ color: 'var(--color-neutral)', fontSize: 14, marginTop: 8, marginBottom: 24 }}>
          seconds — your seat is held
        </div>
        <button
          type="button"
          data-testid="reconnect-reload"
          onClick={() => window.location.reload()}
          style={buttonStyle}
          className="active:scale-95"
        >
          Reload now
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
        <button type="button" onClick={onDismissExpired} style={buttonStyle} className="active:scale-95">
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
