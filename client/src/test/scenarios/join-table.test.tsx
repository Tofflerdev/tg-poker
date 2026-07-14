import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TableList } from '../../pages/TableList';
import type { TableInfo } from '../../../../types/index';

function makeTable(overrides: Partial<TableInfo> = {}): TableInfo {
  return {
    id: 't-beg-1',
    name: 'Beginner 1',
    config: { smallBlind: 5, bigBlind: 10, minBuyIn: 400, maxBuyIn: 1000, maxPlayers: 6, turnDuration: 20 },
    playerCount: 2,
    maxPlayers: 6,
    status: 'waiting',
    ...overrides,
  } as any as TableInfo;
}

describe('Scenario: join table', () => {
  it('clicking a table row fires onSelectTable with that table id', () => {
    const onSelectTable = vi.fn();
    const tables: TableInfo[] = [
      makeTable({ id: 't-beg-1', name: 'Beginner 1' }),
      makeTable({
        id: 't-std-1',
        name: 'Standard 1',
        config: { smallBlind: 10, bigBlind: 20, minBuyIn: 800, maxBuyIn: 2000, maxPlayers: 6, turnDuration: 20 } as any,
      }),
    ];
    render(<TableList tables={tables} onSelectTable={onSelectTable} onBack={vi.fn()} />);

    // The table name is rendered inside a Card with role="button" and onClick.
    // Clicking the name text bubbles up to the Card's onClick handler.
    const beg = screen.getByText(/beginner 1/i);
    // Walk up to the Card which has role="button"
    const card = beg.closest('[role="button"]') as HTMLElement;
    fireEvent.click(card ?? beg);

    expect(onSelectTable).toHaveBeenCalledTimes(1);
    expect(onSelectTable).toHaveBeenCalledWith('t-beg-1');
  });

  it('renders no table rows for empty tables array (smoke — no crash)', () => {
    const { container } = render(
      <TableList tables={[]} onSelectTable={vi.fn()} onBack={vi.fn()} />
    );
    // Smoke: no crash on empty state; EmptyState renders instead.
    expect(container).toBeTruthy();
    // No role="button" table rows — only the Back button exists
    const buttons = container.querySelectorAll('[role="button"]');
    expect(buttons.length).toBe(0);
  });

  it('clicking the Back button fires onBack', () => {
    const onBack = vi.fn();
    render(
      <TableList
        tables={[makeTable()]}
        onSelectTable={vi.fn()}
        onBack={onBack}
      />
    );
    // Back button is rendered via <Button variant="neutral" aria-label="Back">
    const backBtn = screen.getByRole('button', { name: /back/i });
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
