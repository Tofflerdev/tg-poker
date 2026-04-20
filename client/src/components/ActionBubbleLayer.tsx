import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { ActionBubble } from './ActionBubble';
import type { ActionBubbleEvent } from '../../../types/index';

/**
 * Phase 3 / Plan 03-03 — per-seat FIFO bubble layer.
 *
 * D-02: positioned over seat avatar using SEAT_POSITIONS_* arrays from SeatsDisplay,
 *       rotated so "my seat" sits at bottom (matches SeatsDisplay visualIndex).
 * D-03: per-seat independent queues — five seats can render five bubbles in parallel.
 * D-04: 900 ms minimum hold per bubble before dequeue.
 * D-09: kept separate from SeatsDisplay so seat re-render churn does not affect bubble lifecycle.
 *
 * SECURITY (T-3-DOS): unbounded queue is theoretically possible if the server
 * spams events; in practice game pace bounds this to ≤ 1 action per seat per
 * ~1 s. No explicit cap in v1.0 (D-03 leaves cap to a future phase if needed).
 */

// Sourced from SeatsDisplay.tsx — KEEP IN SYNC if seat layout changes.
// (Layout is stable per CLAUDE.md "Compact Card" contract; not extracted to a
// shared module because the duplication is minimal and the alternative would
// reshape SeatsDisplay's existing positioning without benefit.)
const SEAT_POSITIONS_DESKTOP = [
  { left: '50%', top: '94%', align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '70%', align: 'translate(-15%, -50%)' },
  { left: '4%',  top: '30%', align: 'translate(-15%, -50%)' },
  { left: '50%', top: '6%',  align: 'translate(-50%, 0%)' },
  { left: '96%', top: '30%', align: 'translate(-85%, -50%)' },
  { left: '96%', top: '70%', align: 'translate(-85%, -50%)' },
];
const SEAT_POSITIONS_MOBILE = [
  { left: '50%', top: '95%', align: 'translate(-50%, -100%)' },
  { left: '4%',  top: '73%', align: 'translate(-5%, -50%)' },
  { left: '4%',  top: '37%', align: 'translate(-5%, -50%)' },
  { left: '50%', top: '5%',  align: 'translate(-50%, 0%)' },
  { left: '96%', top: '37%', align: 'translate(-95%, -50%)' },
  { left: '96%', top: '73%', align: 'translate(-95%, -50%)' },
];

const TOTAL_SEATS = 6;
const HOLD_MS = 900;

export interface BubbleQueueItem {
  id: string;          // unique per enqueue (RESEARCH Gotcha #3 — key uniqueness)
  action: ActionBubbleEvent['action'];
  amount: number;
}

export interface ActionBubbleLayerProps {
  /** Seat index of the viewer (0-5) or null if the viewer is a spectator. */
  mySeat: number | null;
  /** Whether the layer should use the mobile seat-position arrays. */
  isMobile?: boolean;
  /**
   * Imperative push API exposed to GameRoom. GameRoom wires the socket
   * `actionBubble` listener and calls this on each event.
   *
   * Refactor option: replace with a forwardRef + imperative handle if the
   * inline-callback pattern feels heavier than expected. The current shape
   * keeps the layer self-contained for unit testing.
   */
  registerPushHandle?: (push: (evt: ActionBubbleEvent) => void) => void;
}

/** Test-only export: the hold duration constant used by the layer (D-04). */
export const ACTION_BUBBLE_HOLD_MS = HOLD_MS;

let bubbleIdCounter = 0;
function nextBubbleId(): string {
  bubbleIdCounter += 1;
  return `b-${Date.now()}-${bubbleIdCounter}`;
}

export const ActionBubbleLayer: React.FC<ActionBubbleLayerProps> = ({
  mySeat,
  isMobile = false,
  registerPushHandle,
}) => {
  // Per-seat FIFO queue. Map keyed by seat index; value is FIFO array. Head item
  // is currently rendered; on hold-elapsed, head shifts off and next renders.
  const [queues, setQueues] = useState<Map<number, BubbleQueueItem[]>>(() => new Map());

  // Track which seats have an active hold timeout so we don't double-schedule.
  const timeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Schedule the head-removal timer for a seat if one isn't already running and
  // the seat has a head bubble.
  const scheduleHeadRemoval = useCallback((seat: number) => {
    if (timeoutsRef.current.has(seat)) return; // already scheduled
    const timeout = setTimeout(() => {
      timeoutsRef.current.delete(seat);
      setQueues((prev) => {
        const next = new Map(prev);
        const q = next.get(seat);
        if (!q || q.length === 0) {
          next.delete(seat);
          return next;
        }
        const remaining = q.slice(1);
        if (remaining.length === 0) {
          next.delete(seat);
        } else {
          next.set(seat, remaining);
        }
        return next;
      });
    }, HOLD_MS);
    timeoutsRef.current.set(seat, timeout);
  }, []);

  // Whenever queues change, ensure every seat with a head bubble has a removal
  // timer scheduled. This re-runs after each shift so the next bubble's hold
  // timer starts at the moment it becomes the head.
  useEffect(() => {
    queues.forEach((_q, seat) => scheduleHeadRemoval(seat));
  }, [queues, scheduleHeadRemoval]);

  // Cleanup all timers on unmount.
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      timeouts.forEach((t) => clearTimeout(t));
      timeouts.clear();
    };
  }, []);

  const pushBubble = useCallback((evt: ActionBubbleEvent) => {
    const item: BubbleQueueItem = {
      id: nextBubbleId(),
      action: evt.action,
      amount: evt.amount,
    };
    setQueues((prev) => {
      const next = new Map(prev);
      const existing = next.get(evt.seat) ?? [];
      next.set(evt.seat, [...existing, item]);
      return next;
    });
  }, []);

  // Expose the push handle to the parent (GameRoom) once on mount.
  useEffect(() => {
    if (registerPushHandle) {
      registerPushHandle(pushBubble);
    }
  }, [registerPushHandle, pushBubble]);

  const positions = isMobile ? SEAT_POSITIONS_MOBILE : SEAT_POSITIONS_DESKTOP;
  const rotationOffset = mySeat !== null ? mySeat : 0;

  return (
    <div
      data-testid="action-bubble-layer"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      {/*
        AnimatePresence wraps the full list of seat anchors. When a seat's
        queue drains to empty, its anchor is removed from the JSX tree —
        AnimatePresence then plays the ActionBubble's exit animation on the
        way out. When a seat's head changes (same seat, next queued bubble),
        the anchor itself stays mounted and the inner ActionBubble is keyed
        on head.id so it unmounts/mounts instantly — the old pill is
        replaced without an exit-animation tail holding it in the DOM.
        This is the plan's fallback pattern (03-03-PLAN §Task 2 NOTE) for
        AnimatePresence + fake-timers + same-seat queueing.
      */}
      <AnimatePresence mode="sync">
        {Array.from(queues.entries()).map(([seat, q]) => {
          const head = q[0];
          if (!head) return null;
          const visualIndex = (seat - rotationOffset + TOTAL_SEATS) % TOTAL_SEATS;
          const pos = positions[visualIndex];
          return (
            <div
              key={`seat-${seat}`}
              data-testid={`bubble-anchor-seat-${seat}`}
              style={{
                position: 'absolute',
                left: pos.left,
                top: pos.top,
                // Two-step transform: first the seat alignment, then a translateY
                // upward to clear the seat card top edge. D-02 anchor rule.
                transform: `${pos.align} translateY(-100%) translateY(-8px)`,
                pointerEvents: 'none',
              }}
            >
              <ActionBubble key={head.id} action={head.action} amount={head.amount} />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
