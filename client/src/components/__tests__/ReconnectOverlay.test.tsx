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
  GRACE_MID_HAND_MS,
  GRACE_BETWEEN_HANDS_MS,
} from '../ReconnectOverlay';

describe('ReconnectOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports debounce + grace constants matching D-B4 (1500 / 30000 / 120000 ms)', () => {
    expect(RECONNECT_OVERLAY_DEBOUNCE_MS).toBe(1500);
    expect(GRACE_MID_HAND_MS).toBe(30_000);
    expect(GRACE_BETWEEN_HANDS_MS).toBe(120_000);
  });

  it('does NOT render when socket has not disconnected', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('does NOT render when reconnect lands within 1500 ms (debounce)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { sock._trigger('connect'); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders 1500 ms after disconnect with countdown text (D-B4)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
  });

  it('countdown infers mid-hand (30 s) when lastStage is preflop/flop/turn/river (D-B4)', () => {
    const sock = makeMockSocket();
    const { rerender } = render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    const overlay = screen.getByTestId('reconnect-overlay');
    // Initial countdown should reflect ~30 s remaining (mid-hand)
    expect(overlay.textContent).toMatch(/30|29|28/);
  });

  it('countdown infers between-hands (120 s) when lastStage is waiting/showdown', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="waiting" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    const overlay = screen.getByTestId('reconnect-overlay');
    expect(overlay.textContent).toMatch(/120|119|118/);
  });

  it('dismisses on tableJoined event', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByTestId('reconnect-overlay')).toBeInTheDocument();
    act(() => { sock._trigger('tableJoined', { tableId: 'table-standard-1', seat: 0, state: {} }); });
    expect(screen.queryByTestId('reconnect-overlay')).not.toBeInTheDocument();
  });

  it('renders sat-out sub-view after 30 s mid-hand expiry (D-B4 expired state)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 30_000 + 100); });
    expect(screen.getByTestId('reconnect-overlay-sat-out')).toBeInTheDocument();
  });

  it('renders vacated sub-view after 120 s between-hands expiry', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="waiting" />);
    act(() => { sock._trigger('disconnect'); });
    act(() => { vi.advanceTimersByTime(1500 + 120_000 + 100); });
    expect(screen.getByTestId('reconnect-overlay-vacated')).toBeInTheDocument();
  });

  it('renders "logged in elsewhere" sub-view on replacedBySession event (D-A3)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
    act(() => { sock._trigger('replacedBySession'); });
    expect(screen.getByTestId('reconnect-overlay-replaced')).toBeInTheDocument();
  });

  it('rapid disconnect → connect → disconnect cycle within 1500 ms never shows overlay (debounce reset)', () => {
    const sock = makeMockSocket();
    render(<ReconnectOverlay socket={sock as any} lastStage="flop" />);
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
