import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdminTables } from '../AdminTables';
import type { AdminState, AdminTableInfo } from '../../../../../types/index';

function makeSocket() {
  return { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
}

function makeTable(overrides: Partial<AdminTableInfo> = {}): AdminTableInfo {
  return {
    id: 't-beg-1',
    name: 'Beginner 1',
    status: 'enabled',
    playerCount: 2,
    handInProgress: false,
    config: { smallBlind: 5, bigBlind: 10, buyIn: 500 },
    ...overrides,
  } as AdminTableInfo;
}

function makeState(overrides: Partial<AdminState> = {}): AdminState {
  return {
    tables: [],
    users: [],
    totalChipsInPlay: 0,
    recentAuditLogs: [],
    ...overrides,
  } as any as AdminState;
}

describe('AdminTables', () => {
  it('renders empty state when no tables configured', () => {
    const socket = makeSocket();
    render(<AdminTables state={makeState()} socket={socket as any} />);
    expect(screen.getByText(/no tables configured/i)).toBeInTheDocument();
  });

  it('renders a table row with name + Disable Table button', () => {
    const socket = makeSocket();
    render(<AdminTables state={makeState({ tables: [makeTable()] })} socket={socket as any} />);
    expect(screen.getByText(/beginner 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disable table/i })).toBeInTheDocument();
  });

  it('clicking Disable Table on an enabled table emits disableTable event with tableId', () => {
    const socket = makeSocket();
    render(<AdminTables state={makeState({ tables: [makeTable()] })} socket={socket as any} />);
    fireEvent.click(screen.getByRole('button', { name: /disable table/i }));
    expect(socket.emit).toHaveBeenCalledTimes(1);
    // AdminTables.tsx line 114: socket.emit('disableTable', { tableId: t.id })
    const [eventName, payload] = socket.emit.mock.calls[0];
    expect(eventName).toMatch(/disable/i);
    expect(payload).toMatchObject({ tableId: 't-beg-1' });
  });
});
