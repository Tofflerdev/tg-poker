import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConsentBanner } from '../ConsentBanner';

function makeSocket() {
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
    _trigger: (event: string, payload?: any) => {
      handlers.get(event)?.forEach(cb => cb(payload));
    },
  };
}

describe('ConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Accept button emits acceptTos with version 1.0', () => {
    const socket = makeSocket();
    render(<ConsentBanner socket={socket as any} onAccept={vi.fn()} onViewLegal={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    expect(socket.emit).toHaveBeenCalledWith('acceptTos', { version: '1.0' });
  });

  it('on tosAccepted server ack, calls onAccept and persists dismiss flag', () => {
    const socket = makeSocket();
    const onAccept = vi.fn();
    render(<ConsentBanner socket={socket as any} onAccept={onAccept} onViewLegal={vi.fn()} />);
    // Simulate server ack — wrapped in act() to flush state updates
    act(() => { socket._trigger('tosAccepted'); });
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('consent_banner_dismissed_v1')).toBe('1');
  });

  it('Dismiss button does NOT emit; banner unmounts', () => {
    const socket = makeSocket();
    render(
      <ConsentBanner socket={socket as any} onAccept={vi.fn()} onViewLegal={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    // No emit
    expect(socket.emit).not.toHaveBeenCalled();
    // Banner replaces itself with null
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument();
    // Persists localStorage flag
    expect(localStorage.getItem('consent_banner_dismissed_v1')).toBe('1');
  });

  it('renders null if localStorage flag is already set', () => {
    localStorage.setItem('consent_banner_dismissed_v1', '1');
    const socket = makeSocket();
    const { container } = render(
      <ConsentBanner socket={socket as any} onAccept={vi.fn()} onViewLegal={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('Read terms inline link calls onViewLegal("tos")', () => {
    const onViewLegal = vi.fn();
    const socket = makeSocket();
    render(<ConsentBanner socket={socket as any} onAccept={vi.fn()} onViewLegal={onViewLegal} />);
    fireEvent.click(screen.getByRole('button', { name: /read terms/i }));
    expect(onViewLegal).toHaveBeenCalledWith('tos');
  });
});
