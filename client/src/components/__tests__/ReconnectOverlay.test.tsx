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
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('does NOT render when reconnect lands within 1500 ms (debounce)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { sock._trigger('connect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders 1500 ms after disconnect with countdown text (D-B4)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
  });

  it('counts down the window the SERVER sent, not a hardcoded stage guess', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={90_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    // 90 s because that is what tableJoined carried — the old build would have shown
    // 30 s here (stage=flop) while the server actually held the seat far longer.
    expect(screen.getByTestId('reconnect-overlay').textContent).toMatch(/90|89|88/);
  });

  it('falls back to the default window when the server has not said (not seated yet)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={null} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay').textContent).toMatch(/120|119|118/);
  });

  it('offers a manual reload while reconnecting', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-reload')).toBeInTheDocument();
  });

  it('dismisses on tableJoined event', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
    act(() => { sock._trigger('tableJoined', { tableId: 'table-standard-1', seat: 0, state: {} }); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders the vacated sub-view once the window expires', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 120_000 + 100); });
    expect(screen.getByTestId('reconnect-overlay-vacated')).toBeInTheDocument();
  });

  it('has no sat-out dead end — returning inside the window just re-seats the player', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 30_000 + 100); });
    // The old build showed a terminal "You were sat out / Back to Tables" screen at
    // 30 s. Sitting out is now an invisible chip-protection step, not a dead end.
    expect(screen.queryByTestId('reconnect-overlay-sat-out')).not.toBeInTheDocument();
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
  });

  it('renders "logged in elsewhere" sub-view on replacedBySession event (D-A3)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
    act(() => { sock._trigger('replacedBySession'); });
    expect(screen.getByTestId('reconnect-overlay-replaced')).toBeInTheDocument();
  });

  it('rapid disconnect → connect → disconnect cycle within 1500 ms never shows overlay (debounce reset)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} reconnectWindowMs={120_000} />);
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
});
