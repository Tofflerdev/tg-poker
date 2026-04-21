import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHandHistory } from '../useHandHistory';

/** Minimal socket double — vi.fn() for on/off/emit; preserves listener registry for fake-event dispatch. */
function makeSocket() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const on = vi.fn((event: string, handler: (...args: any[]) => void) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler);
    listeners.set(event, set);
  });
  const off = vi.fn((event: string, handler: (...args: any[]) => void) => {
    listeners.get(event)?.delete(handler);
  });
  const emit = vi.fn();
  const dispatch = (event: string, ...args: any[]) => {
    listeners.get(event)?.forEach((h) => h(...args));
  };
  return { on, off, emit, dispatch, listeners };
}

describe('useHandHistory', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does NOT emit when active=false; initial state is { rows: null, loading: false, error: null }', () => {
    const sock = makeSocket();
    const { result } = renderHook(() => useHandHistory(sock as any, false));
    expect(sock.emit).not.toHaveBeenCalled();
    expect(result.current).toEqual({ rows: null, loading: false, error: null });
  });

  it('emits getHandHistory ONCE when active flips to true and enters loading', () => {
    const sock = makeSocket();
    const { result, rerender } = renderHook(({ active }) => useHandHistory(sock as any, active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    expect(sock.emit).toHaveBeenCalledTimes(1);
    expect(sock.emit).toHaveBeenCalledWith('getHandHistory');
    expect(result.current).toEqual({ rows: null, loading: true, error: null });
  });

  it('transitions to data on handHistoryData event', () => {
    const sock = makeSocket();
    const { result } = renderHook(() => useHandHistory(sock as any, true));
    const fakeRows = [{
      handId: 'h1', tableId: 't', tableName: '⭐', playedAt: 'iso',
      board: [], seat: 0, holeCards: [], netDelta: 0, finalChips: 0,
      showedDown: false, won: false, opponents: [],
    }];
    act(() => { sock.dispatch('handHistoryData', fakeRows); });
    expect(result.current).toEqual({ rows: fakeRows, loading: false, error: null });
  });

  it('transitions to error on handHistoryError event', () => {
    const sock = makeSocket();
    const { result } = renderHook(() => useHandHistory(sock as any, true));
    act(() => { sock.dispatch('handHistoryError', 'Server error'); });
    expect(result.current).toEqual({ rows: null, loading: false, error: 'Server error' });
  });

  it('transitions to timeout error after 5 seconds when no response arrives', () => {
    const sock = makeSocket();
    const { result } = renderHook(() => useHandHistory(sock as any, true));
    expect(result.current.loading).toBe(true);
    act(() => { vi.advanceTimersByTime(4999); });
    expect(result.current.loading).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toEqual({ rows: null, loading: false, error: 'timeout' });
  });

  it('does NOT trigger timeout if data arrived first', () => {
    const sock = makeSocket();
    const { result } = renderHook(() => useHandHistory(sock as any, true));
    act(() => { sock.dispatch('handHistoryData', []); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current.error).toBe(null);
    expect(result.current.rows).toEqual([]);
  });

  it('unsubscribes when active flips true → false (cleanup of off-cycle listeners)', () => {
    const sock = makeSocket();
    const { result, rerender } = renderHook(({ active }) => useHandHistory(sock as any, active), {
      initialProps: { active: true },
    });
    const onCallsBefore = sock.on.mock.calls.length;
    const offCallsBefore = sock.off.mock.calls.length;
    rerender({ active: false });
    // Listeners removed
    expect(sock.off.mock.calls.length).toBe(offCallsBefore + 2); // data + error
    // A late dispatch must NOT mutate state.
    act(() => { sock.dispatch('handHistoryData', [{ handId: 'late' } as any]); });
    expect(result.current.rows).toBe(null);
    // Toggling back on subscribes again.
    rerender({ active: true });
    expect(sock.on.mock.calls.length).toBeGreaterThan(onCallsBefore);
  });

  it('emits getHandHistory once per active=true transition (re-entry refreshes data)', () => {
    const sock = makeSocket();
    const { rerender } = renderHook(({ active }) => useHandHistory(sock as any, active), {
      initialProps: { active: true },
    });
    expect(sock.emit).toHaveBeenCalledTimes(1);
    rerender({ active: false });
    rerender({ active: true });
    expect(sock.emit).toHaveBeenCalledTimes(2);
    rerender({ active: false });
    rerender({ active: true });
    expect(sock.emit).toHaveBeenCalledTimes(3);
  });

  it('cleans up listeners + timeout on unmount (no late state updates)', () => {
    const sock = makeSocket();
    const { result, unmount } = renderHook(() => useHandHistory(sock as any, true));
    unmount();
    // After unmount, dispatching events must be a no-op (listeners off'd) and
    // timeout firing must not throw.
    act(() => { sock.dispatch('handHistoryData', [{ handId: 'late' } as any]); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(result.current).toEqual({ rows: null, loading: true, error: null }); // last pre-unmount state
  });
});
