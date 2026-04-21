import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HandHistoryList } from '../HandHistoryList';
import type { HandHistoryDTO } from '../../../../types/index';

/** Minimal socket double exposing dispatch (mirrors useHandHistory.test.ts shape). */
function makeSocket() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const on = vi.fn((event: string, handler: any) => {
    const set = listeners.get(event) ?? new Set();
    set.add(handler);
    listeners.set(event, set);
  });
  const off = vi.fn((event: string, handler: any) => {
    listeners.get(event)?.delete(handler);
  });
  const emit = vi.fn();
  const dispatch = (event: string, ...args: any[]) => {
    listeners.get(event)?.forEach((h) => h(...args));
  };
  return { on, off, emit, dispatch };
}

const mkRow = (handId: string, over: Partial<HandHistoryDTO> = {}): HandHistoryDTO => ({
  handId,
  tableId: 'table-standard-1',
  tableName: '⭐ Standard Table #1',
  playedAt: new Date(Date.now() - 60_000).toISOString(),
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  seat: 0,
  holeCards: ['Ah', 'Kh'],
  netDelta: 100,
  finalChips: 1100,
  showedDown: true,
  won: true,
  opponents: [],
  ...over,
});

describe('HandHistoryList', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders loading state immediately on activate', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    expect(screen.getByText('Loading hand history...')).toBeInTheDocument();
    expect(sock.emit).toHaveBeenCalledWith('getHandHistory');
  });

  it('renders empty state when handHistoryData arrives with []', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    act(() => { sock.dispatch('handHistoryData', []); });
    expect(screen.getByText('No hands yet')).toBeInTheDocument();
    expect(screen.getByText('Your played hands will appear here.')).toBeInTheDocument();
  });

  it('renders list when handHistoryData arrives with rows', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    act(() => {
      sock.dispatch('handHistoryData', [mkRow('h1', { netDelta: 250 }), mkRow('h2', { netDelta: -50 })]);
    });
    expect(screen.getByRole('list', { name: 'Hand history' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('+250')).toBeInTheDocument();
    expect(screen.getByText('-50')).toBeInTheDocument();
  });

  it('renders error state on handHistoryError', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    act(() => { sock.dispatch('handHistoryError', 'Server error'); });
    expect(screen.getByText('Could not load hand history.')).toBeInTheDocument();
    expect(screen.getByText('Try closing and reopening your profile.')).toBeInTheDocument();
  });

  it('renders error state when no response within 5 seconds (timeout)', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    expect(screen.getByText('Loading hand history...')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText('Could not load hand history.')).toBeInTheDocument();
  });

  it('does not emit getHandHistory while inactive', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={false} />);
    expect(sock.emit).not.toHaveBeenCalled();
  });

  it('only one row can be expanded at a time', () => {
    const sock = makeSocket();
    render(<HandHistoryList socket={sock as any} active={true} />);
    act(() => {
      sock.dispatch('handHistoryData', [mkRow('h1'), mkRow('h2'), mkRow('h3')]);
    });
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // Initially none expanded
    items.forEach((item) => expect(item).toHaveAttribute('aria-expanded', 'false'));
    // Tap the first → expanded
    fireEvent.click(items[0]);
    expect(items[0]).toHaveAttribute('aria-expanded', 'true');
    // Tap the second → first collapses, second expands
    fireEvent.click(items[1]);
    expect(items[0]).toHaveAttribute('aria-expanded', 'false');
    expect(items[1]).toHaveAttribute('aria-expanded', 'true');
    expect(items[2]).toHaveAttribute('aria-expanded', 'false');
    // Tap the second again → collapses (toggle off)
    fireEvent.click(items[1]);
    expect(items[1]).toHaveAttribute('aria-expanded', 'false');
  });
});
