import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no ResizeObserver; the table layout observes its container. Any test
// that renders the game view needs this stub to get past commit.
if (typeof globalThis !== 'undefined' && !(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

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

// D-09: Global Telegram.WebApp stub. Every test gets a safe-default WebApp
// so components using `useTelegram()` don't crash on `window.Telegram?.WebApp`
// access. Individual tests may override via `vi.stubGlobal('Telegram', ...)`.
if (typeof window !== 'undefined' && !window.Telegram) {
  const noop = () => {};
  window.Telegram = {
    WebApp: {
      initData: '',
      initDataUnsafe: {} as any,
      version: '7.0',
      platform: 'tdesktop',
      colorScheme: 'dark',
      themeParams: {},
      isExpanded: true,
      viewportHeight: 800,
      viewportStableHeight: 800,
      isClosingConfirmationEnabled: false,
      BackButton: {
        isVisible: false,
        show: vi.fn(),
        hide: vi.fn(),
        onClick: vi.fn(),
        offClick: vi.fn(),
      },
      MainButton: {
        text: '',
        color: '',
        textColor: '',
        isVisible: false,
        isActive: false,
        isProgressVisible: false,
        setText: vi.fn(),
        setParams: vi.fn(),
        show: vi.fn(),
        hide: vi.fn(),
        onClick: vi.fn(),
        offClick: vi.fn(),
        showProgress: vi.fn(),
        hideProgress: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
      },
      HapticFeedback: {
        impactOccurred: vi.fn(),
        notificationOccurred: vi.fn(),
        selectionChanged: vi.fn(),
      },
      ready: vi.fn(),
      expand: vi.fn(),
      close: vi.fn(),
      enableClosingConfirmation: noop,
      disableClosingConfirmation: noop,
      setHeaderColor: vi.fn(),
      setBackgroundColor: vi.fn(),
      showPopup: vi.fn(),
      showAlert: vi.fn(),
      showConfirm: vi.fn(),
    },
  } as any;
}
