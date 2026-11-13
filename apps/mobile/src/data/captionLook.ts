/**
 * Вид подписи на странице: стиль строк, размер и цвет. Хранится у страницы (captionLook) и на сервере (caption_look).
 *
 * Размер: по умолчанию один на весь текст (size); если человек поменял размер отдельной строки — lines[i].
 * Итоговый размер строки = обычный × size × lines[i] × множитель стиля (у «Заголовка» первая строка крупнее).
 */
import { colors } from '@/theme';

export type CaptionStyle = 'title' | 'plain' | 'quote';
export type CaptionLook = { style?: CaptionStyle; size?: number; lines?: (number | null)[]; color?: string };

export const CAPTION_STYLES: { id: CaptionStyle; name: string }[] = [
  { id: 'title', name: 'Заголовок + подпись' },
  { id: 'plain', name: 'Только подпись' },
  { id: 'quote', name: 'Цитата' },
];

/** Пределы ползунка размера (доля от обычного). */
export const SIZE_MIN = 0.7;
export const SIZE_MAX = 1.8;

/** Обычный размер подписи на странице шириной 358 pt (телефон); на меньшей странице — пропорционально. */
const BASE = 13;
const BASE_W = 358;

/** Во сколько раз строка крупнее из-за стиля: у заголовка первая строка. */
const styleK = (style: CaptionStyle | undefined, i: number) => (style === 'title' && i === 0 ? 1.45 : style === 'quote' ? 1.1 : 1);

/** Размер шрифта строки i на странице шириной w. */
export function lineSize(look: CaptionLook | undefined, i: number, w: number, side = false) {
  const base = (side ? 12 : BASE) * Math.min(1.4, Math.max(0.3, w / BASE_W));
  return base * (look?.size ?? 1) * (look?.lines?.[i] ?? 1) * styleK(look?.style, i);
}

/** Текст подписи для показа: у цитаты — в кавычках. */
export const captionText = (text: string, look?: CaptionLook) => (look?.style === 'quote' ? `«${text.trim()}»` : text);

/** Размер поменяли (весь текст или строку) — показываем «По умолчанию». */
export const sizeChanged = (look?: CaptionLook) => (look?.size ?? 1) !== 1 || !!look?.lines?.some((x) => x != null && x !== 1);

/** Основные цвета: белый и чёрный, потом три пастельных, которые хорошо печатаются и подходят почти к любым фото. */
export const BASE_COLORS: { hex: string; name: string }[] = [
  { hex: '#FFFFFF', name: 'Белый' },
  { hex: '#1D2120', name: 'Чёрный' },
  { hex: '#B9878B', name: 'Пыльная роза' },
  { hex: '#8FA58C', name: 'Шалфей' },
  { hex: '#8BA3B8', name: 'Дымчато-голубой' },
];

/** Цвет подписи по умолчанию — как раньше. */
export const DEFAULT_COLOR = colors.mut;

function lum(hex: string) {
  const ch = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/** Контраст двух цветов (WCAG). */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** Подпись этим цветом на странице такого фона читается плохо (контраст меньше 3:1). */
export const poorOn = (hex: string | undefined, bg = '#FFFFFF') => !!hex && /^#[0-9a-f]{6}$/i.test(hex) && contrast(hex, bg) < 3;
export const poorOnWhite = (hex?: string) => poorOn(hex);
/** Светлый цвет (для плашки под подписью: под светлый текст — тёмная, под тёмный — светлая). */
export const isLight = (hex: string) => lum(hex) > 0.5;
/** Цвет подписи по умолчанию для фона: на тёмной странице — светлый. */
export const defaultColorOn = (bg: string) => (isLight(bg) ? DEFAULT_COLOR : '#E9E2DA');
