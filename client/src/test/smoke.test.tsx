import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('vitest client smoke', () => {
  it('renders a basic React element via RTL', () => {
    render(<div>hello vitest</div>);
    expect(screen.getByText('hello vitest')).toBeInTheDocument();
  });

  it('window.matchMedia is mocked (does not throw)', () => {
    expect(() => window.matchMedia('(prefers-reduced-motion: reduce)')).not.toThrow();
  });
});
