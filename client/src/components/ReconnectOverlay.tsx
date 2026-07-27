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
 *   - reconnecting  — SEATED only: counting down the held seat, manual reload escape
 *   - offline       — NOT seated: a plain "connection lost" banner, no clock
 *   - vacated       — window ran out; the seat was cashed out while away
 *   - replaced      — logged in elsewhere (D-A3, instantaneous, bypasses debounce)
 *
 * The old 'sat-out' terminal view is gone: returning inside the window puts the
 * player straight back at the table (the server re-seats them on auth), so there is
 * nothing to dismiss. Sitting out is now an invisible chip-protection step, not a
 * dead end the player has to click out of.
 *
 * `isSeated` gates everything seat-shaped. A player idling in the menu (or with the
 * app backgrounded) drops the socket exactly like a seated player does, but has no
 * seat to hold and no chips at stake — the server's disconnect handler does nothing
 * for them (GraceRegistry.arm runs only for a seated telegramId). Showing them the
 * countdown and then "Removed from table — chips returned" described events that
 * never happened; reported from prod on 2026-07-27. Unseated disconnects now get the
 * non-blocking banner and never reach a terminal sub-view.
 *
 * Pure consumer of socket lifecycle events:
 *   'disconnect' → debounce, then show     'connect' → dismiss
 *   'tableJoined' → dismiss (server pushed a snapshot — D-A2)
 *   'replacedBySession' → replaced view
 *
 * Pitfall 5 (rapid disconnect/connect flicker) is closed by the debounce ref, plus a
 * socket.connected re-check when the debounce fires: a backgrounded WebView freezes
 * timers and runs them all on resume, so the debounce can elapse "instantly" against
 * a transport that is already back.
 */

export const RECONNECT_OVERLAY_DEBOUNCE_MS = 1500;
/** Fallback when the server hasn't told us yet (not seated → seat-holding is moot). */
export const DEFAULT_RECONNECT_WINDOW_MS = 120_000;

export interface ReconnectOverlayProps {
  socket: Socket<ExtendedServerEvents, ExtendedClientEvents>;
  /** Seat-holding window from the server's tableJoined; null until seated. */
  reconnectWindowMs?: number | null;
  /**
   * Is the player actually sitting at a table right now? Only then is there a seat
   * being held, a countdown worth showing, and a possible "vacated" ending.
   */
  isSeated?: boolean;
  /** Callback for the "Back to Tables" button in the vacated sub-view. */
  onDismissExpired?: () => void;
}

type OverlayState =
  | { kind: 'hidden' }
  | { kind: 'reconnecting'; expiresAt: number }
  | { kind: 'offline' }
  | { kind: 'vacated' }
  | { kind: 'replaced' };

export function ReconnectOverlay({
  socket,
  reconnectWindowMs,
  isSeated = false,
  onDismissExpired,
}: ReconnectOverlayProps): JSX.Element | null {
  const [overlayState, setOverlayState] = useState<OverlayState>({ kind: 'hidden' });
  const [tickNow, setTickNow] = useState<number>(Date.now());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Read the freshest window/seat from the closure-captured disconnect callback.
  const windowRef = useRef<number>(reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS);
  const seatedRef = useRef<boolean>(isSeated);

  useEffect(() => {
    windowRef.current = reconnectWindowMs ?? DEFAULT_RECONNECT_WINDOW_MS;
  }, [reconnectWindowMs]);

  useEffect(() => {
    seatedRef.current = isSeated;
  }, [isSeated]);

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
        // A backgrounded WebView freezes timers and fires them all on resume, so this
        // can run against a transport that reconnected in the meantime.
        if (socket.connected) return;

        // Nothing seated → nothing held → no clock and no terminal state. Just say the
        // connection dropped.
        if (!seatedRef.current) {
          setOverlayState({ kind: 'offline' });
          return;
        }

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
      //
      // 'vacated' clears too, and that matters: it is a GUESS (a client-side timer
      // ran out while offline), and the moment the socket is back the server settles
      // the question within a couple of hundred milliseconds — tableJoined if the
      // seat is still there, exitCompleted → ExitToast if it really was cashed out.
      // Leaving the guess on screen stranded reconnected players on a dead end that
      // only a button press could clear (reported from prod 2026-07-27).
      // 'replaced' stays: that one is the server's own word, not a timer.
      clearAllTimers();
      setOverlayState((prev) => (prev.kind === 'replaced' ? prev : { kind: 'hidden' }));
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

  if (overlayState.kind === 'offline') {
    // Not seated: nothing is at stake, so this must not take the screen hostage the
    // way the seated countdown does. A top-docked neutral banner — the menu stays
    // readable, and the moment the transport returns it disappears by itself.
    return (
      <div
        data-testid="reconnect-banner-offline"
        role="status"
        style={{
          position: 'fixed',
          top: 'max(env(safe-area-inset-top), 12px)',
          left: 12,
          right: 12,
          zIndex: 1000,
          background: 'rgba(10,10,14,0.9)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1.5px solid rgba(176,190,197,0.6)',
          borderRadius: 14,
          boxShadow: '0 0 12px rgba(176,190,197,0.25)',
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ flex: 1, color: 'var(--color-neutral)', fontSize: 13, lineHeight: 1.4 }}>
          Connection lost — reconnecting…
        </div>
        <button
          type="button"
          data-testid="reconnect-banner-reload"
          onClick={() => window.location.reload()}
          style={{
            background: 'transparent',
            border: '1.5px solid rgba(176,190,197,0.6)',
            color: 'var(--color-neutral)',
            borderRadius: 10,
            minWidth: 44,
            minHeight: 44,
            padding: '0 12px',
            cursor: 'pointer',
          }}
          className="active:scale-95"
        >
          Reload
        </button>
      </div>
    );
  }

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
