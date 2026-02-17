import { useEffect, useState, useCallback } from 'react';
import type { TelegramUser, WebAppInitData, WebAppUser } from '../../../types/index';

// Type definitions for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: WebAppInitData;
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        isClosingConfirmationEnabled: boolean;
        BackButton: {
          isVisible: boolean;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
          setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        showPopup: (params: { title?: string; message: string; buttons?: Array<{ id?: string; type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text: string }> }, callback?: (buttonId: string) => void) => void;
        showAlert: (message: string, callback?: () => void) => void;
        showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
      };
    };
  }
}

interface UseTelegramReturn {
  user: TelegramUser | null;
  initData: string | null;
  initDataRaw: WebAppInitData | null;
  isReady: boolean;
  isExpanded: boolean;
  expand: () => void;
  close: () => void;
  ready: () => void;
  hapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  } | null;
  showMainButton: (text: string, onClick: () => void, params?: { color?: string; textColor?: string }) => void;
  hideMainButton: () => void;
  setMainButtonLoading: (loading: boolean) => void;
  showBackButton: (onClick: () => void) => void;
  hideBackButton: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  showPopup: (title: string, message: string, callback?: () => void) => void;
  showAlert: (message: string, callback?: () => void) => void;
  showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
  themeParams: Window['Telegram']['WebApp']['themeParams'] | null;
}

export function useTelegram(): UseTelegramReturn {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string | null>(null);
  const [initDataRaw, setInitDataRaw] = useState<WebAppInitData | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hapticFeedback, setHapticFeedback] = useState<UseTelegramReturn['hapticFeedback']>(null);
  const [themeParams, setThemeParams] = useState<UseTelegramReturn['themeParams']>(null);

  useEffect(() => {
    try {
      const webApp = window.Telegram?.WebApp;
      
      if (!webApp) {
        console.log('Telegram WebApp not detected - running in standalone mode');
        setIsReady(true);
        return;
      }

      // Get init data
      setInitData(webApp.initData || '');
      setInitDataRaw(webApp.initDataUnsafe);
      
      // Parse user data
      if (webApp.initDataUnsafe?.user) {
        const tgUser = webApp.initDataUnsafe.user;
        setUser({
          id: tgUser.id.toString(),
          telegramId: tgUser.id,
          username: tgUser.username,
          firstName: tgUser.first_name,
          lastName: tgUser.last_name,
          photoUrl: tgUser.photo_url,
          balance: 1000, // Default starting balance
        });
      }

      setIsExpanded(webApp.isExpanded || false);
      setHapticFeedback(webApp.HapticFeedback || null);
      setThemeParams(webApp.themeParams);
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize Telegram WebApp:', error);
      setIsReady(true);
    }
  }, []);

  const expand = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.expand) {
      webApp.expand();
      setIsExpanded(true);
    }
  }, []);

  const close = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.close) {
      webApp.close();
    }
  }, []);

  const ready = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.ready) {
      webApp.ready();
    }
  }, []);

  const showMainButton = useCallback((text: string, onClick: () => void, params?: { color?: string; textColor?: string }) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.MainButton) {
      webApp.MainButton.setText(text);
      if (params?.color || params?.textColor) {
        webApp.MainButton.setParams({ 
          color: params?.color, 
          text_color: params?.textColor 
        });
      }
      webApp.MainButton.onClick(onClick);
      webApp.MainButton.show();
    }
  }, []);

  const hideMainButton = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.MainButton?.hide) {
      webApp.MainButton.hide();
    }
  }, []);

  const setMainButtonLoading = useCallback((loading: boolean) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.MainButton) {
      if (loading) {
        webApp.MainButton.showProgress();
      } else {
        webApp.MainButton.hideProgress();
      }
    }
  }, []);

  const showBackButton = useCallback((onClick: () => void) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.BackButton) {
      webApp.BackButton.onClick(onClick);
      webApp.BackButton.show();
    }
  }, []);

  const hideBackButton = useCallback(() => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.BackButton?.hide) {
      webApp.BackButton.hide();
    }
  }, []);

  const setHeaderColor = useCallback((color: string) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.setHeaderColor) {
      webApp.setHeaderColor(color);
    }
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.setBackgroundColor) {
      webApp.setBackgroundColor(color);
    }
  }, []);

  const showPopup = useCallback((title: string, message: string, callback?: () => void) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.showPopup) {
      webApp.showPopup({ title, message }, callback ? () => callback() : undefined);
    } else {
      alert(`${title}\n${message}`);
      callback?.();
    }
  }, []);

  const showAlert = useCallback((message: string, callback?: () => void) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.showAlert) {
      webApp.showAlert(message, callback);
    } else {
      alert(message);
      callback?.();
    }
  }, []);

  const showConfirm = useCallback((message: string, callback?: (confirmed: boolean) => void) => {
    const webApp = window.Telegram?.WebApp;
    if (webApp?.showConfirm) {
      webApp.showConfirm(message, callback);
    } else {
      const confirmed = confirm(message);
      callback?.(confirmed);
    }
  }, []);

  return {
    user,
    initData,
    initDataRaw,
    isReady,
    isExpanded,
    expand,
    close,
    ready,
    hapticFeedback,
    showMainButton,
    hideMainButton,
    setMainButtonLoading,
    showBackButton,
    hideBackButton,
    setHeaderColor,
    setBackgroundColor,
    showPopup,
    showAlert,
    showConfirm,
    themeParams,
  };
}

export default useTelegram;
