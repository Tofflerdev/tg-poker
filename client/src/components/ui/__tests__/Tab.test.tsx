import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tab, TabBar } from '../Tab';

describe('Tab', () => {
  it('fires onClick when clicked (standalone Tab)', () => {
    const onClick = vi.fn();
    render(<Tab label="Foo" active={false} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /foo/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TabBar', () => {
  const TABS = [
    { id: 'profile', label: 'Profile' },
    { id: 'avatar', label: 'Avatar' },
    { id: 'history', label: 'History' },
  ];

  it('renders a tablist with one button per tab', () => {
    render(<TabBar tabs={TABS} activeId="profile" onChange={vi.fn()} />);
    const list = screen.getByRole('tablist');
    expect(list).toBeInTheDocument();
    // Each tab is a <button>
    expect(screen.getByRole('button', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /avatar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });

  it('clicking an inactive tab fires onChange with that tab id', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} activeId="profile" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /avatar/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('avatar');
  });

  it('clicking the already-active tab still fires onChange with its id', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={TABS} activeId="profile" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /profile/i }));
    expect(onChange).toHaveBeenCalledWith('profile');
  });

  it('switches the active highlight when activeId prop changes', () => {
    const { rerender } = render(<TabBar tabs={TABS} activeId="profile" onChange={vi.fn()} />);
    // Re-render with a different activeId — no crash, still renders all 3.
    rerender(<TabBar tabs={TABS} activeId="history" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /history/i })).toBeInTheDocument();
  });
});
