import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';

// Plan 03-03 §Task 2 NOTE: motion/react's AnimatePresence keeps an exiting
// child in the DOM until its exit animation finishes (~200 ms per D-05).
// Under vitest fake timers, the animation RAFs never tick, so the exiting
// node would linger indefinitely — masking the true queue state.
//
// The plan explicitly allows dropping AnimatePresence for the unit test
// while keeping the behavioral contract: "head renders → 900 ms → next
// renders". We achieve that by mocking motion/react so AnimatePresence is
// a transparent passthrough (renders children directly) and motion.span
// is a plain span that ignores animation props. Production code keeps the
// real AnimatePresence + motion.span exit/enter animations.
vi.mock('motion/react', async () => {
  const ReactMod = await import('react');
  const passthrough = (tag: string) => ReactMod.forwardRef<HTMLElement, any>((props, ref) => {
    // Strip motion-only props so React doesn't warn about unknown DOM attrs.
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

import { ActionBubbleLayer, ACTION_BUBBLE_HOLD_MS } from '../ActionBubbleLayer';
import type { ActionBubbleEvent } from '../../../../types/index';

const mkEvt = (
  seat: number,
  action: ActionBubbleEvent['action'],
  amount = 0,
  allIn = false,
): ActionBubbleEvent => ({
  tableId: 'T',
  telegramId: '1001',
  seat,
  action,
  amount,
  totalBetThisStreet: amount,
  potAfter: 130,
  allIn,
});

describe('ActionBubbleLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the layer with absolute inset 0, pointer-events none, z-index 30', () => {
    render(<ActionBubbleLayer mySeat={null} />);
    const layer = screen.getByTestId('action-bubble-layer');
    expect(layer).toHaveStyle({
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: '30',
    });
  });

  it('uses 900 ms as the hold duration (D-04)', () => {
    expect(ACTION_BUBBLE_HOLD_MS).toBe(900);
  });

  it('renders a pushed bubble immediately and removes it after 900 ms hold', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    expect(push).toBeDefined();

    act(() => { push!(mkEvt(0, 'check')); });
    expect(screen.getByText('CHECK')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-anchor-seat-0')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText('CHECK')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bubble-anchor-seat-0')).not.toBeInTheDocument();
  });

  it('does NOT render bubbles for fold / all-in (status-badge-backed actions)', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => {
      push!(mkEvt(0, 'fold'));
      push!(mkEvt(1, 'allin', 800));
    });
    expect(screen.queryByText('FOLD')).not.toBeInTheDocument();
    expect(screen.queryByText('ALL-IN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bubble-anchor-seat-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bubble-anchor-seat-1')).not.toBeInTheDocument();
  });

  it('suppresses a call/raise that left the player all-in (evt.allIn flag)', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => {
      push!(mkEvt(0, 'call', 100, true));   // call-all-in → suppressed
      push!(mkEvt(1, 'raise', 200, true));  // raise-all-in → suppressed
      push!(mkEvt(2, 'call', 50, false));   // normal call → still shown
    });
    expect(screen.queryByText('CALL 100')).not.toBeInTheDocument();
    expect(screen.queryByText('RAISE TO 200')).not.toBeInTheDocument();
    expect(screen.getByText('CALL 50')).toBeInTheDocument();
    expect(screen.queryByTestId('bubble-anchor-seat-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bubble-anchor-seat-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('bubble-anchor-seat-2')).toBeInTheDocument();
  });

  it('renders FIVE bubbles in parallel for FIVE different seats (per-seat queues, D-03)', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => {
      push!(mkEvt(0, 'check'));
      push!(mkEvt(1, 'check'));
      push!(mkEvt(2, 'check'));
      push!(mkEvt(3, 'check'));
      push!(mkEvt(4, 'check'));
    });
    // All five visible at once — none are queued behind a global serializer.
    expect(screen.getAllByText('CHECK')).toHaveLength(5);
    expect(screen.getByTestId('bubble-anchor-seat-0')).toBeInTheDocument();
    expect(screen.getByTestId('bubble-anchor-seat-4')).toBeInTheDocument();
  });

  it('queues a second action at the same seat behind the first (FIFO per seat)', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => {
      push!(mkEvt(2, 'call', 100));
      push!(mkEvt(2, 'raise', 500));
    });
    // Only the first (head) is rendered.
    expect(screen.getByText('CALL 100')).toBeInTheDocument();
    expect(screen.queryByText('RAISE TO 500')).not.toBeInTheDocument();

    // After 900 ms the first dequeues; the second becomes head and renders.
    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText('CALL 100')).not.toBeInTheDocument();
    expect(screen.getByText('RAISE TO 500')).toBeInTheDocument();
  });

  it('assigns unique ids so AnimatePresence does not collapse identical actions', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    render(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => {
      push!(mkEvt(0, 'check'));
      push!(mkEvt(0, 'check')); // identical to the first
    });
    // Head renders the first.
    expect(screen.getAllByText('CHECK')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(900); });
    // Second (with a fresh unique id) takes over as head.
    expect(screen.getAllByText('CHECK')).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(900); });
    expect(screen.queryByText('CHECK')).not.toBeInTheDocument();
  });

  it('rotates seat positions so mySeat becomes bottom (visualIndex 0)', () => {
    // mySeat=2 means seat 2 maps to visualIndex 0 (bottom desktop position).
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    const { rerender } = render(
      <ActionBubbleLayer mySeat={2} registerPushHandle={(p) => { push = p; }} />
    );
    act(() => { push!(mkEvt(2, 'check')); });
    const anchor = screen.getByTestId('bubble-anchor-seat-2');
    // Seat 2 with mySeat=2 → visualIndex 0 → SEAT_POSITIONS_DESKTOP[0] = top: 94%, left: 50%.
    expect(anchor).toHaveStyle({ left: '50%', top: '94%' });

    // mySeat=null → visualIndex equals raw seat 2 → SEAT_POSITIONS_DESKTOP[2] = top: 30%, left: 4%.
    act(() => { vi.advanceTimersByTime(900); }); // clear queue
    rerender(<ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />);
    act(() => { push!(mkEvt(2, 'check')); });
    const anchor2 = screen.getByTestId('bubble-anchor-seat-2');
    expect(anchor2).toHaveStyle({ left: '4%', top: '30%' });
  });

  it('cleans up timers on unmount', () => {
    let push: ((evt: ActionBubbleEvent) => void) | undefined;
    const { unmount } = render(
      <ActionBubbleLayer mySeat={null} registerPushHandle={(p) => { push = p; }} />
    );
    act(() => { push!(mkEvt(0, 'check')); });
    expect(() => { unmount(); }).not.toThrow();
    // Advancing timers post-unmount must not throw nor try to setState on
    // unmounted component.
    expect(() => { act(() => { vi.advanceTimersByTime(2000); }); }).not.toThrow();
  });
});
