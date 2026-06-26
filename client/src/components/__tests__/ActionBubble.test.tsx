import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionBubble, bubbleLabel } from '../ActionBubble';

// Mock motion/react useReducedMotion so tests can flip the flag.
const mockReducedMotion = vi.fn<[], boolean | null>(() => false);
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => mockReducedMotion(),
  };
});

describe('bubbleLabel', () => {
  it('returns exact UI-SPEC strings per action', () => {
    expect(bubbleLabel('fold', 0)).toBe('FOLD');
    expect(bubbleLabel('check', 0)).toBe('CHECK');
    expect(bubbleLabel('call', 100)).toBe('CALL 100');
    expect(bubbleLabel('bet', 250)).toBe('BET 250');
    expect(bubbleLabel('raise', 500)).toBe('RAISE TO 500');
    expect(bubbleLabel('allin', 1200)).toBe('ALL-IN');
    expect(bubbleLabel('allin', 0)).toBe('ALL-IN');
  });
});

describe('ActionBubble (rendering)', () => {
  beforeEach(() => {
    mockReducedMotion.mockReset();
    mockReducedMotion.mockReturnValue(false);
  });

  it('renders FOLD label with fold tier', () => {
    render(<ActionBubble action="fold" amount={0} />);
    const el = screen.getByText('FOLD');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('data-action', 'fold');
    expect(el).toHaveAttribute('data-tier', 'fold');
    expect(el).toHaveAttribute('role', 'status');
  });

  it('maps check → call tier', () => {
    render(<ActionBubble action="check" amount={0} />);
    expect(screen.getByText('CHECK')).toHaveAttribute('data-tier', 'call');
  });

  it('maps bet → raise tier', () => {
    render(<ActionBubble action="bet" amount={50} />);
    expect(screen.getByText('BET 50')).toHaveAttribute('data-tier', 'raise');
  });

  it('maps allin → allin tier', () => {
    render(<ActionBubble action="allin" amount={800} />);
    expect(screen.getByText('ALL-IN')).toHaveAttribute('data-tier', 'allin');
  });

  it('uses CSS vars (no hex literals) for color and glow', () => {
    const { container } = render(<ActionBubble action="raise" amount={200} />);
    const el = container.querySelector('[data-action="raise"]') as HTMLElement;
    expect(el).toBeTruthy();
    // Inline style includes a var(--color-action-*) reference, never a hex literal.
    const style = el.getAttribute('style') ?? '';
    expect(style).toMatch(/var\(--color-action-/);
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});

describe('ActionBubble (reduced motion)', () => {
  beforeEach(() => {
    mockReducedMotion.mockReset();
  });

  it('renders without crashing when useReducedMotion returns true', () => {
    mockReducedMotion.mockReturnValue(true);
    render(<ActionBubble action="call" amount={100} />);
    expect(screen.getByText('CALL 100')).toBeInTheDocument();
  });

  it('renders without crashing when useReducedMotion returns null (initial render)', () => {
    mockReducedMotion.mockReturnValue(null);
    render(<ActionBubble action="fold" amount={0} />);
    expect(screen.getByText('FOLD')).toBeInTheDocument();
  });
});
