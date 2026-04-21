import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HandHistoryRow, relativeTime, resultLabel } from '../HandHistoryRow';
import type { HandHistoryDTO } from '../../../../types/index';

const mkRow = (over: Partial<HandHistoryDTO> = {}): HandHistoryDTO => ({
  handId: 'h-1',
  tableId: 'table-standard-1',
  tableName: '⭐ Standard Table #1',
  playedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
  board: ['As', 'Kd', 'Qc', 'Jh', 'Th'],
  seat: 0,
  holeCards: ['Ah', 'Kh'],
  netDelta: 250,
  finalChips: 1500,
  showedDown: true,
  won: true,
  opponents: [],
  ...over,
});

describe('relativeTime helper', () => {
  it('formats seconds, minutes, hours, days, weeks', () => {
    const now = new Date('2026-04-18T12:00:00Z');
    expect(relativeTime(new Date(now.getTime() - 30 * 1000).toISOString(), now)).toBe('30s ago');
    expect(relativeTime(new Date(now.getTime() - 2 * 60 * 1000).toISOString(), now)).toBe('2m ago');
    expect(relativeTime(new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), now)).toBe('3h ago');
    expect(relativeTime(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), now)).toBe('yesterday');
    expect(relativeTime(new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('4d ago');
    expect(relativeTime(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), now)).toBe('2w ago');
  });
});

describe('resultLabel helper', () => {
  it('maps netDelta sign to label + variant', () => {
    expect(resultLabel(250)).toEqual({ text: 'WIN', variant: 'sit' });
    expect(resultLabel(-100)).toEqual({ text: 'LOST', variant: 'fold' });
    expect(resultLabel(0)).toEqual({ text: 'CHOP', variant: 'neutral' });
  });
});

describe('HandHistoryRow (collapsed)', () => {
  it('renders relative time, table name, signed delta, and result badge', () => {
    const row = mkRow({ netDelta: 250, won: true });
    render(<HandHistoryRow row={row} expanded={false} onToggle={() => {}} />);
    expect(screen.getByTestId('row-time').textContent).toMatch(/h ago|m ago/);
    expect(screen.getByTestId('row-table')).toHaveTextContent('⭐ Standard Table #1');
    expect(screen.getByTestId('row-delta')).toHaveTextContent('+250');
    expect(screen.getByText('WIN')).toBeInTheDocument();
  });

  it('renders losing delta with - prefix and LOST badge in fold variant', () => {
    const row = mkRow({ netDelta: -100, won: false });
    render(<HandHistoryRow row={row} expanded={false} onToggle={() => {}} />);
    expect(screen.getByTestId('row-delta')).toHaveTextContent('-100');
    expect(screen.getByText('LOST')).toBeInTheDocument();
    const deltaStyle = screen.getByTestId('row-delta').getAttribute('style') ?? '';
    expect(deltaStyle).toMatch(/var\(--color-action-fold\)/);
  });

  it('renders CHOP badge when netDelta is 0', () => {
    const row = mkRow({ netDelta: 0 });
    render(<HandHistoryRow row={row} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText('CHOP')).toBeInTheDocument();
    expect(screen.getByTestId('row-delta').textContent).toBe('0');
  });

  it('does NOT render the expanded section when expanded=false', () => {
    render(<HandHistoryRow row={mkRow()} expanded={false} onToggle={() => {}} />);
    expect(screen.queryByTestId('row-expanded')).not.toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });

  it('calls onToggle(handId) when the card is tapped', () => {
    const onToggle = vi.fn();
    const row = mkRow({ handId: 'h-42' });
    render(<HandHistoryRow row={row} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('listitem'));
    expect(onToggle).toHaveBeenCalledWith('h-42');
  });

  it('exposes aria-expanded reflecting the expanded prop', () => {
    const { rerender } = render(<HandHistoryRow row={mkRow()} expanded={false} onToggle={() => {}} />);
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-expanded', 'false');
    rerender(<HandHistoryRow row={mkRow()} expanded={true} onToggle={() => {}} />);
    expect(screen.getByRole('listitem')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('HandHistoryRow (expanded)', () => {
  it('renders BOARD and YOUR CARDS sections; own hole cards always shown', () => {
    render(<HandHistoryRow row={mkRow()} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('BOARD')).toBeInTheDocument();
    expect(screen.getByText('YOUR CARDS')).toBeInTheDocument();
    expect(screen.getByLabelText('Board cards')).toBeInTheDocument();
    expect(screen.getByLabelText('Your hole cards')).toBeInTheDocument();
  });

  it('does NOT render SHOWN AT SHOWDOWN when no opponent has shown cards (T-3-PRIVACY-UI)', () => {
    const row = mkRow({
      opponents: [
        { telegramId: '1002', seat: 1, holeCards: [], finalChips: 0, netDelta: -50, won: false, showedDown: false },
        { telegramId: '1003', seat: 2, holeCards: [], finalChips: 0, netDelta: -50, won: false, showedDown: false },
      ],
    });
    render(<HandHistoryRow row={row} expanded={true} onToggle={() => {}} />);
    expect(screen.queryByText('SHOWN AT SHOWDOWN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-showdown')).not.toBeInTheDocument();
  });

  it('renders SHOWN AT SHOWDOWN ONLY for opponents with both showedDown=true AND non-empty holeCards', () => {
    const row = mkRow({
      opponents: [
        { telegramId: '1002', seat: 1, holeCards: [], finalChips: 0, netDelta: -50, won: false, showedDown: false },
        { telegramId: '1003', seat: 2, holeCards: ['Tc', 'Td'], finalChips: 1200, netDelta: 700, won: false, showedDown: true },
        { telegramId: '1004', seat: 4, holeCards: ['7s', '2h'], finalChips: 600, netDelta: -100, won: false, showedDown: true },
      ],
    });
    render(<HandHistoryRow row={row} expanded={true} onToggle={() => {}} />);
    expect(screen.getByText('SHOWN AT SHOWDOWN')).toBeInTheDocument();
    expect(screen.getByTestId('row-opp-1003')).toBeInTheDocument();
    expect(screen.getByTestId('row-opp-1004')).toBeInTheDocument();
    expect(screen.queryByTestId('row-opp-1002')).not.toBeInTheDocument();
  });

  it('does NOT render an opponent whose showedDown=true but holeCards=[] (defense in depth)', () => {
    const row = mkRow({
      opponents: [
        { telegramId: '1099', seat: 1, holeCards: [], finalChips: 0, netDelta: -50, won: false, showedDown: true },
      ],
    });
    render(<HandHistoryRow row={row} expanded={true} onToggle={() => {}} />);
    // The disagreement (true + empty) means we trust the cards array → no render.
    expect(screen.queryByText('SHOWN AT SHOWDOWN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('row-opp-1099')).not.toBeInTheDocument();
  });
});
