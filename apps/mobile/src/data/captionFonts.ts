/**
 * Шрифты подписи на странице книги — из тех, что уже загружены в приложение (app/_layout.tsx).
 * Ключ сохраняется на сервере вместе с подписью (caption_font).
 */
import type { TextStyle } from 'react-native';

import { fonts } from '@/theme';

export const CAPTION_FONTS = [
  { id: 'classic', name: 'Классика', style: { fontFamily: fonts.medium, fontStyle: 'italic' } },
  { id: 'plain', name: 'Простой', style: { fontFamily: fonts.semibold, fontStyle: 'normal' } },
  { id: 'bold', name: 'Акцент', style: { fontFamily: 'Unbounded_600SemiBold', fontStyle: 'normal', letterSpacing: -0.2 } },
  { id: 'hand', name: 'От руки', style: { fontFamily: 'Pacifico_400Regular', fontStyle: 'normal' } },
] as const satisfies readonly { id: string; name: string; style: TextStyle }[];

export type CaptionFont = (typeof CAPTION_FONTS)[number]['id'];

/** Стиль шрифта подписи; неизвестный или пустой — «Классика». */
export const captionFontStyle = (id?: string): TextStyle => (CAPTION_FONTS.find((f) => f.id === id) ?? CAPTION_FONTS[0]).style;
