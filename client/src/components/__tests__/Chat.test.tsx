import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Chat from '../Chat';
import type { TelegramUser } from '../../../../types/index';

// jsdom does not implement scrollIntoView — stub it to avoid "not a function" errors
// from Chat's scrollToBottom() useEffect.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function makeSocket() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

const HERO: TelegramUser = {
  id: 'u1',
  telegramId: 12345,
  username: 'hero',
  firstName: 'Hero',
  displayName: 'Hero',
  balance: 1000,
} as TelegramUser;

describe('Chat', () => {
  it('typing a message and clicking Send emits sendChatMessage with author + trimmed text', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={HERO} tableId="t-1" />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.click(screen.getByLabelText(/send/i));
    expect(socket.emit).toHaveBeenCalledWith('sendChatMessage', {
      authorId: 'u1',
      authorName: 'Hero',
      text: 'hello',
      type: 'player',
    });
  });

  it('empty textarea → Send button disabled, NO emit fires', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={HERO} tableId="t-1" />);
    const send = screen.getByLabelText(/send/i) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(socket.emit).not.toHaveBeenCalledWith('sendChatMessage', expect.anything());
  });

  it('whitespace-only message → button disabled, NO emit fires', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={HERO} tableId="t-1" />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: '   ' } });
    const send = screen.getByLabelText(/send/i) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(send);
    expect(socket.emit).not.toHaveBeenCalledWith('sendChatMessage', expect.anything());
  });

  it('trims whitespace from sent message', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={HERO} tableId="t-1" />);
    const textarea = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(textarea, { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByLabelText(/send/i));
    expect(socket.emit).toHaveBeenCalledWith('sendChatMessage', expect.objectContaining({ text: 'hello' }));
  });

  it('clears textarea after Send', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={HERO} tableId="t-1" />);
    const textarea = screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'hi' } });
    fireEvent.click(screen.getByLabelText(/send/i));
    expect(textarea.value).toBe('');
  });

  it('currentUser=null disables textarea and Send', () => {
    const socket = makeSocket();
    render(<Chat socket={socket as any} currentUser={null} tableId="t-1" />);
    const textarea = screen.getByPlaceholderText(/type a message/i) as HTMLTextAreaElement;
    const send = screen.getByLabelText(/send/i) as HTMLButtonElement;
    expect(textarea.disabled).toBe(true);
    expect(send.disabled).toBe(true);
  });
});
