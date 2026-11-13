/**
 * Оформление книги из вопросов перед сборкой (app/options.tsx): какие фото взять, их размер, фон, украшения.
 * Уходит на сервер вместе с проектом (style) — отбор и раскладка учитывают ответы; фон рисует редактор.
 */
import { createContext, useContext } from 'react';

export type Pick = 'best' | 'most' | 'all';
export type PhotoSize = 'large' | 'medium' | 'small';
export type PageBg = 'white' | 'beige' | 'dark';
export type Deco = 'none' | 'few' | 'stickers';
export type BookStyle = { pick: Pick; size: PhotoSize; bg: PageBg | 'auto'; deco: Deco };

/** По умолчанию — как собирали до вопросов: почти все фото, средний размер, фон подбирает ИИ. */
export const DEFAULT_STYLE: BookStyle = { pick: 'most', size: 'medium', bg: 'auto', deco: 'none' };

export const PICKS: { id: Pick; name: string; sub: string; share: number }[] = [
  { id: 'best', name: 'Лучшие', sub: 'Только самые удачные кадры', share: 0.6 },
  { id: 'most', name: 'Почти все', sub: 'Кроме очень похожих', share: 0.85 },
  { id: 'all', name: 'Все', sub: 'Кроме смазанных', share: 1 },
];
export const SIZES: { id: PhotoSize; name: string; sub: string; perPage: number }[] = [
  { id: 'large', name: 'Крупно', sub: '1–2 фото на странице', perPage: 1.5 },
  { id: 'medium', name: 'Средне', sub: '2–3 фото', perPage: 2.5 },
  { id: 'small', name: 'Много мелких', sub: '3–4 фото', perPage: 3.5 },
];
export const BGS: { id: PageBg | 'auto'; name: string }[] = [
  { id: 'white', name: 'Белый' },
  { id: 'beige', name: 'Бежевый' },
  { id: 'dark', name: 'Тёмный' },
  { id: 'auto', name: 'ИИ подберёт' },
];
export const DECOS: { id: Deco; name: string; sub: string }[] = [
  { id: 'none', name: 'Без украшений', sub: 'Только фото и подписи' },
  { id: 'few', name: 'Немного', sub: 'Тонкие линии и уголки' },
  { id: 'stickers', name: 'Тематические стикеры', sub: 'ИИ подберёт набор по фото' },
];

/** Цвет листа. */
export const PAGE_BG: Record<PageBg, string> = { white: '#FFFFFF', beige: '#F3EBE1', dark: '#262321' };

/** Сколько страниц выйдет: фото после отбора / фото на странице. */
export function pagesFor(n: number, style: BookStyle) {
  const share = PICKS.find((p) => p.id === style.pick)?.share ?? 0.85;
  const per = SIZES.find((x) => x.id === style.size)?.perPage ?? 2.5;
  return Math.round((n * share) / per);
}

/** Фон страниц книги — для PageView и подписей (контекст, чтобы не передавать через все экраны). */
export const PageBgContext = createContext<string>(PAGE_BG.white);
export const usePageBg = () => useContext(PageBgContext);
