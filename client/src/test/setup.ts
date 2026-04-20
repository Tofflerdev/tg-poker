import '@testing-library/jest-dom/vitest';

// motion/react's useReducedMotion reads window.matchMedia. jsdom does not
// implement it. Mock to a non-reduced default for tests; individual tests
// can override via vi.stubGlobal.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
