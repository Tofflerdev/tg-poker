import { describe, it, expect } from 'vitest';

describe('vitest server smoke', () => {
  it('runs and asserts true', () => {
    expect(1 + 1).toBe(2);
  });

  it('has globals enabled', () => {
    expect(typeof describe).toBe('function');
    expect(typeof expect).toBe('function');
  });
});
