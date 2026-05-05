import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Consent } from '../../pages/Consent';

function makeSocket() {
  const handlers = new Map<string, Set<(payload?: any) => void>>();
  return {
    on: vi.fn((event: string, cb: (payload?: any) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(cb);
    }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event: string, payload?: any) => {
      handlers.get(event)?.forEach(cb => cb(payload));
    },
  };
}

describe('Scenario: ToS gate', () => {
  it('Accept button is disabled until checkbox is checked', () => {
    const socket = makeSocket();
    render(<Consent socket={socket as any} onAccept={vi.fn()} onViewLegal={vi.fn()} />);
    const accept = screen.getByRole('button', { name: /accept & continue/i }) as HTMLButtonElement;
    expect(accept.disabled).toBe(true);
  });

  it('checking the checkbox + clicking Accept emits acceptTos with version 1.0', () => {
    const socket = makeSocket();
    render(<Consent socket={socket as any} onAccept={vi.fn()} onViewLegal={vi.fn()} />);

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    const accept = screen.getByRole('button', { name: /accept & continue/i });
    fireEvent.click(accept);

    expect(socket.emit).toHaveBeenCalledWith('acceptTos', { version: '1.0' });
  });

  it('on tosAccepted server ack, onAccept prop is invoked', () => {
    const socket = makeSocket();
    const onAccept = vi.fn();
    render(<Consent socket={socket as any} onAccept={onAccept} onViewLegal={vi.fn()} />);

    act(() => {
      socket._trigger('tosAccepted');
    });

    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
