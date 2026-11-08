/**
 * Демо-данные главной. Позже заменяются ответом GET /home (notes/14-backend-start.md).
 */
import type { AlbumTheme, PhotoKey } from '@/theme';

export type Suggestion = {
  id: string;
  title: string;
  meta: string;
  tag: string;
  tagTone: 'coral' | 'green';
  cover: [PhotoKey, PhotoKey, PhotoKey];
};

export type Album = {
  id: string;
  title: string;
  subtitle: string;
  theme: AlbumTheme;
};

export type CurrentOrder = {
  id: string;
  title: string;
  stage: 'accepted' | 'checked' | 'printing' | 'delivery' | 'ready';
  when: string;
};

export const points = 350;

export const suggestions: Suggestion[] = [
  { id: 'karelia', title: 'Карелия, июль', meta: '214 фото · 24 стр.', tag: 'черновик готов', tagTone: 'coral', cover: ['g2', 'g6', 'g3'] },
  { id: 'year-2026', title: 'Книга года 2026', meta: '1 240 фото · к 20 дек', tag: 'к Новому году', tagTone: 'green', cover: ['g6', 'g1', 'g4'] },
  { id: 'dacha', title: 'Дача, август', meta: '96 фото · 16 стр.', tag: 'черновик готов', tagTone: 'coral', cover: ['g5', 'g3', 'g1'] },
];

export const albums: Album[] = [
  { id: 'matvey', title: 'Первый год Матвея', subtitle: 'Classic 20×20 · 18 из 24 страниц', theme: 'child' },
  { id: 'wedding', title: 'Свадьба Ани и Миши', subtitle: 'общий альбом · 34 гостя', theme: 'wedding' },
];

export const currentOrder: CurrentOrder = {
  id: '4792088',
  title: 'Везём «Юбилей мамы»',
  stage: 'delivery',
  when: 'завтра',
};

export const STAGES: CurrentOrder['stage'][] = ['accepted', 'checked', 'printing', 'delivery', 'ready'];

/* ---------- книга и цена (экран «Книга и цена», путь А) ---------- */
export type Tariff = {
  id: 'lite' | 'classic' | 'premium';
  name: string;
  price: number; // за проект, с текущей скидкой
  readyBy: string;
  about: string;
  cover: [string, string];
  tall?: boolean;
};

/** Цены за 24 страницы иллюстративные; источник правды — справочник D14 (бэкенд). */
export const tariffs: Tariff[] = [
  { id: 'lite', name: 'Lite', price: 62.4, readyBy: '13 ноя', about: 'Lite — тонкие листы, как в журнале', cover: ['#ECC097', '#C8806B'] },
  { id: 'classic', name: 'Classic', price: 81.09, readyBy: '14 ноя', about: 'Classic — плотные листы, раскрытие на 180°', cover: ['#A9CDD2', '#5C8A88'] },
  { id: 'premium', name: 'Premium', price: 96.6, readyBy: '15 ноя', about: 'Premium — фотобумага 1 мм, без шва по центру', cover: ['#DF948A', '#A9443F'], tall: true },
];

export const drafts: Record<string, { title: string; pages: number; format: string; photos: number }> = {
  karelia: { title: 'Карелия, июль', pages: 24, format: '20×20', photos: 38 },
  'year-2026': { title: 'Книга года 2026', pages: 40, format: '21×30', photos: 96 },
  dacha: { title: 'Дача, август', pages: 16, format: '20×20', photos: 24 },
};

/* ---------- оформление ---------- */
export const delivery = [
  { id: 'evropochta', title: 'Мой пункт · Европочта', sub: 'ПВЗ №112, Притыцкого, 29 · от 2 дней', price: 5.9 },
  { id: 'courier', title: 'Курьер по Минску', sub: 'в выбранный день', price: 14.9 },
] as const;

export const phoneMasked = '+375 29 •••-••-67';

/** Цена пика пока не утверждена (Алеся, #30) — условно 1 пик = 0,01 р. */
export const PIK_RATE = 0.01;
