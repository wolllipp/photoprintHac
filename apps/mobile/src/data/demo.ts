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
