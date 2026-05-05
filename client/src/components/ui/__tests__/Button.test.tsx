import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../Button';

describe('Button', () => {
  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button variant="fold" onClick={onClick}>Fold</Button>);
    fireEvent.click(screen.getByRole('button', { name: /fold/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button variant="fold" disabled onClick={onClick}>Fold</Button>);
    fireEvent.click(screen.getByRole('button', { name: /fold/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('routes variant="fold" through VARIANT_TIER to color var(--color-action-fold)', () => {
    render(<Button variant="fold">Fold</Button>);
    const btn = screen.getByRole('button', { name: /fold/i });
    expect(btn.getAttribute('style')).toContain('var(--color-action-fold)');
  });

  it('routes variant="call" through VARIANT_TIER to color var(--color-action-call)', () => {
    render(<Button variant="call">Call</Button>);
    const btn = screen.getByRole('button', { name: /call/i });
    expect(btn.getAttribute('style')).toContain('var(--color-action-call)');
  });

  it('emphasis=true applies inset glow box-shadow', () => {
    render(<Button variant="raise" emphasis>Raise</Button>);
    const btn = screen.getByRole('button', { name: /raise/i });
    expect(btn.getAttribute('style')).toContain('inset 0 0 12px');
  });

  it('emphasis absent renders box-shadow: none', () => {
    render(<Button variant="fold">Fold</Button>);
    const btn = screen.getByRole('button', { name: /fold/i });
    const style = btn.getAttribute('style') ?? '';
    expect(style).toMatch(/box-shadow:\s*none/i);
  });
});
