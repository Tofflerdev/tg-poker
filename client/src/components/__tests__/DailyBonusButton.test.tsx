import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DailyBonusButton } from '../DailyBonusButton';

describe('DailyBonusButton', () => {
  it('eligible (canClaimDaily=true) → click fires onClaim', () => {
    const onClaim = vi.fn();
    render(<DailyBonusButton balance={500} canClaimDaily={true} onClaim={onClaim} />);
    fireEvent.click(screen.getByRole('button', { name: /daily bonus/i }));
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('eligible (balance<1000, no lastRefill) → click fires onClaim', () => {
    const onClaim = vi.fn();
    render(<DailyBonusButton balance={500} onClaim={onClaim} />);
    fireEvent.click(screen.getByRole('button', { name: /daily bonus/i }));
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it('ineligible (balance>=1000) → click does NOT fire onClaim (disabled button)', () => {
    const onClaim = vi.fn();
    render(<DailyBonusButton balance={1500} onClaim={onClaim} />);
    fireEvent.click(screen.getByRole('button', { name: /daily bonus/i }));
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('ineligible (canClaimDaily=false explicitly) → click does NOT fire onClaim', () => {
    const onClaim = vi.fn();
    render(<DailyBonusButton balance={500} canClaimDaily={false} onClaim={onClaim} />);
    fireEvent.click(screen.getByRole('button', { name: /daily bonus/i }));
    expect(onClaim).not.toHaveBeenCalled();
  });

  it('eligible state renders "Daily Bonus" label and "Ready" status', () => {
    render(<DailyBonusButton balance={500} canClaimDaily={true} onClaim={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /daily bonus/i });
    expect(btn.textContent).toMatch(/daily bonus/i);
    expect(btn.textContent).toMatch(/ready/i);
  });
});
