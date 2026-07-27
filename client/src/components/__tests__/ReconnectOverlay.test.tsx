import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';

// Plan 04-05 may use motion/react for enter/exit; mirror the ActionBubbleLayer
// test mock so animations don't block fake timers.
vi.mock('motion/react', async () => {
  const ReactMod = await import('react');
  const passthrough = (tag: string) => ReactMod.forwardRef<HTMLElement, any>((props, ref) => {
    const { initial, animate, exit, transition, variants, whileHover, whileTap, layout, ...rest } = props;
    return ReactMod.createElement(tag, { ...rest, ref });
  });
  const motion: any = new Proxy({}, { get: (_t, tag: string) => passthrough(tag) });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => ReactMod.createElement(ReactMod.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

// Mock socket: a tiny event-emitter facade matching socket.io-client's interface.
function makeMockSocket() {
  const handlers = new Map<string, Set<(payload?: any) => void>>();
  return {
    // The overlay re-checks this when the debounce fires (a frozen WebView runs every
    // pending timer at once on resume, possibly after the transport is already back).
    connected: false,
    on: vi.fn((event: string, cb: (payload?: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb?: (payload?: any) => void) => {
      if (!cb) handlers.delete(event);
      else handlers.get(event)?.delete(cb);
    }),
    emit: vi.fn(),
    // Test helper to synthesize a server→client event:
    _trigger: (event: string, payload?: any) => {
      handlers.get(event)?.forEach(cb => cb(payload));
    },
  };
}

import {
  ReconnectOverlay,
  RECONNECT_OVERLAY_DEBOUNCE_MS,
  DEFAULT_RECONNECT_WINDOW_MS,
} from '../ReconnectOverlay';

describe('ReconnectOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports the debounce and a fallback window (exit-reconnect D: one window, no stages)', () => {
    expect(RECONNECT_OVERLAY_DEBOUNCE_MS).toBe(1500);
    expect(DEFAULT_RECONNECT_WINDOW_MS).toBe(120_000);
  });

  it('does NOT render when socket has not disconnected', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('does NOT render when reconnect lands within 1500 ms (debounce)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { sock._trigger('connect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders 1500 ms after disconnect with countdown text (D-B4)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
  });

  it('counts down the window the SERVER sent, not a hardcoded stage guess', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={90_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    // 90 s because that is what tableJoined carried — the old build would have shown
    // 30 s here (stage=flop) while the server actually held the seat far longer.
    expect(screen.getByTestId('reconnect-overlay').textContent).toMatch(/90|89|88/);
  });

  it('falls back to the default window when the server has not said it yet', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay').textContent).toMatch(/120|119|118/);
  });

  it('offers a manual reload while reconnecting', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-reload')).toBeInTheDocument();
  });

  it('dismisses on tableJoined event', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
    act(() => { sock._trigger('tableJoined', { tableId: 'table-standard-1', seat: 0, state: {} }); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders the vacated sub-view once the window expires', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 120_000 + 100); });
    expect(screen.getByTestId('reconnect-overlay-vacated')).toBeInTheDocument();
  });

  /**
   * Reported from prod 2026-07-27 (screenshot at 12:47): the player was still looking
   * at "Removed from table" while the server logs showed their socket had reconnected
   * and re-authenticated several times over. The vacated view is a client-side GUESS
   * (a timer that ran out offline) — once the transport is back the server answers
   * within a couple hundred ms, so the guess must not outlive the reconnect.
   */
  it('clears the vacated view when the transport comes back — the server decides now', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 120_000 + 100); });
    expect(screen.getByTestId('reconnect-overlay-vacated')).toBeInTheDocument();

    act(() => { sock._trigger('connect'); });
    expect(screen.queryByTestId('reconnect-overlay-vacated')).not.toBeInTheDocument();
  });

  it('keeps the replaced view on connect — that verdict came from the server', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('replacedBySession'); });
    act(() => { sock._trigger('connect'); });
    expect(screen.getByTestId('reconnect-overlay-replaced')).toBeInTheDocument();
  });

  it('has no sat-out dead end — returning inside the window just re-seats the player', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 30_000 + 100); });
    // The old build showed a terminal "You were sat out / Back to Tables" screen at
    // 30 s. Sitting out is now an invisible chip-protection step, not a dead end.
    expect(screen.queryByTestId('reconnect-overlay-sat-out')).not.toBeInTheDocument();
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
  });

  it('renders "logged in elsewhere" sub-view on replacedBySession event (D-A3)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('replacedBySession'); });
    expect(screen.getByTestId('reconnect-overlay-replaced')).toBeInTheDocument();
  });

  it('rapid disconnect → connect → disconnect cycle within 1500 ms never shows overlay (debounce reset)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(200); });
    act(() => { sock._trigger('connect'); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { sock._trigger('connect'); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  /**
   * Reported from prod on 2026-07-27: idling in the main menu (or just backgrounding
   * the app) ran the whole seated disconnect story — the seat countdown, then
   * "Removed from table — chips returned to balance" — for a player who had not sat
   * down. The server never touched them (GraceRegistry.arm only fires for a seated
   * telegramId), so the entire episode was client-side fiction.
   */
  describe('not seated (menu, profile, backgrounded app)', () => {
    it('never shows the seat countdown — it is holding no seat', () => {
      const sock = makeMockSocket();
      render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} isSeated={false} />);
      act(() => { sock._trigger('disconnect'); });
      act(() => { vi.advanceTimersByTime(1500); });
      expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
      expect(screen.getByTestId('reconnect-banner-offline')).toBeInTheDocument();
    });

    it('never reaches the "removed from table" ending, however long the absence', () => {
      const sock = makeMockSocket();
      render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} isSeated={false} />);
      act(() => { sock._trigger('disconnect'); });
      // Ten minutes away — well past any window the seated path would have expired.
      act(() => { vi.advanceTimersByTime(1500 + 600_000); });
      expect(screen.queryByTestId('reconnect-overlay-vacated')).not.toBeInTheDocument();
      expect(screen.getByTestId('reconnect-banner-offline')).toBeInTheDocument();
    });

    it('a stale reconnectWindowMs from a table left earlier does not resurrect the countdown', () => {
      const sock = makeMockSocket();
      // The player was seated, left, and is now in the menu: App still holds the
      // window the server sent on tableJoined. isSeated is what decides, not that.
      render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} isSeated={false} />);
      act(() => { sock._trigger('disconnect'); });
      act(() => { vi.advanceTimersByTime(1500 + 120_000 + 100); });
      expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
      expect(screen.queryByTestId('reconnect-overlay-vacated')).not.toBeInTheDocument();
    });

    it('the banner clears itself when the transport comes back', () => {
      const sock = makeMockSocket();
      render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} isSeated={false} />);
      act(() => { sock._trigger('disconnect'); });
      act(() => { vi.advanceTimersByTime(1500); });
      expect(screen.getByTestId('reconnect-banner-offline')).toBeInTheDocument();
      act(() => { sock._trigger('connect'); });
      expect(screen.queryByTestId('reconnect-banner-offline')).not.toBeInTheDocument();
    });

    it('shows nothing at all when the frozen debounce fires after the socket is already back', () => {
      const sock = makeMockSocket();
      render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} isSeated={false} />);
      // A backgrounded WebView freezes timers; on resume the pending debounce runs
      // immediately, and socket.io may have restored the transport in between
      // without re-emitting 'connect' before this callback.
      act(() => { sock._trigger('disconnect'); });
      sock.connected = true;
      act(() => { vi.advanceTimersByTime(1500); });
      expect(screen.queryByTestId('reconnect-banner-offline')).not.toBeInTheDocument();
    });
  });
});
