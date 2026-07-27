/**
 * Единая точка сборки URL картинки карты (public/cards/, работает и в dev, и в проде).
 *
 * `?v=` — принудительный сброс кэша. Имена файлов стабильные (`AS.png`), Vite их
 * не хэширует, а nginx отдаёт /cards/ без Cache-Control — значит WebView Telegram
 * применяет эвристическую свежесть по Last-Modified и может часами показывать
 * старую колоду. Версия вкомпилирована в бандл, а бандл хэшируется — поэтому
 * новый деплой гарантированно запрашивает новые файлы. Поднимать при замене арта.
 */
export const CARD_ART_VERSION = 3;

export function cardSrc(code?: string): string {
  // Скрытые карты соперника приходят с сервера как "back" (Game.ts, toPublicState).
  // Без этой ветки code.toUpperCase() давал /cards/BACK.png: на Windows ФС
  // регистронезависима и локально всё работало, а на проде nginx не находил файл
  // и SPA-fallback отдавал index.html как картинку — рубашки соперников были битыми.
  const file = code && code.toLowerCase() !== 'back' ? `${code.toUpperCase()}.png` : 'back.png';
  return `/cards/${file}?v=${CARD_ART_VERSION}`;
}

/** Радиус скругления, запечённый в PNG: 12px на холсте шириной 160. */
export const CARD_RADIUS_RATIO = 0.075;
