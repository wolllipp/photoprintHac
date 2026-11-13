/**
 * Рамки для фото на странице: без рамки, белые поля (паспарту), тонкая линия, полароид (широкое поле снизу),
 * скруглённые углы. У страницы своя рамка (frame); «Ко всем страницам» — одна на всю книгу.
 * Только простые варианты — не «магазин рамок»: печатаются чисто на любом фоне.
 */
import type { ViewStyle } from 'react-native';

export type FrameId = 'none' | 'mat' | 'line' | 'polaroid' | 'round';

export const FRAMES: { id: FrameId; name: string }[] = [
  { id: 'none', name: 'Без рамки' },
  { id: 'mat', name: 'Белые поля' },
  { id: 'line', name: 'Тонкая линия' },
  { id: 'polaroid', name: 'Полароид' },
  { id: 'round', name: 'Скругление' },
];

/**
 * Как рисовать рамку места размером w×h: стиль внешнего слоя (поля, линия, тень) и отступы фото внутри.
 * bleed — фото во всю страницу без полей: там рамка не нужна.
 */
export function frameGeometry(id: FrameId | undefined, w: number, h: number, bleed = false): { outer: ViewStyle; inset: { top: number; left: number; right: number; bottom: number }; radius: number } {
  const m = Math.min(w, h);
  const zero = { top: 0, left: 0, right: 0, bottom: 0 };
  if (bleed || !id || id === 'none') return { outer: { borderRadius: bleed ? 0 : 4 }, inset: zero, radius: bleed ? 0 : 4 };
  if (id === 'mat') {
    const p = Math.max(3, m * 0.06);
    return { outer: { backgroundColor: '#fff', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }, inset: { top: p, left: p, right: p, bottom: p }, radius: 0 };
  }
  if (id === 'polaroid') {
    const p = Math.max(3, m * 0.05);
    return { outer: { backgroundColor: '#fff', borderRadius: 2, boxShadow: '0 2px 5px rgba(0,0,0,0.16)' }, inset: { top: p, left: p, right: p, bottom: Math.max(8, m * 0.18) }, radius: 0 };
  }
  if (id === 'line') {
    const p = Math.max(2, m * 0.025);
    return { outer: { borderWidth: 1.2, borderColor: 'rgba(29,33,32,0.55)', borderRadius: 2 }, inset: { top: p, left: p, right: p, bottom: p }, radius: 0 };
  }
  // скругление
  const r = m * 0.12;
  return { outer: { borderRadius: r }, inset: zero, radius: r };
}
