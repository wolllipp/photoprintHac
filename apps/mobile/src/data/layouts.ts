/**
 * Макеты страниц книги. Каждый — набор прямоугольников в долях страницы (x, y, ширина, высота):
 * по ним страница и рисуется, и понимает, на какое фото нажали. caption — место под подпись (не фото),
 * bleed — фото во всю страницу, без белых полей.
 */
export type Rect = { x: number; y: number; w: number; h: number };
/** Где подпись относительно фото. */
export type CaptionAt = 'top' | 'bottom' | 'left' | 'right';
/** hidden — не показываем в ленте макетов: это та же «с подписью», только подпись в другом месте (выбирается в редакторе подписи). */
export type LayoutDef = { id: string; name: string; slots: Rect[]; caption?: Rect; captionAt?: CaptionAt; bleed?: boolean; hidden?: boolean };

const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const LAYOUTS: LayoutDef[] = [
  { id: 'one', name: 'Одно крупное', slots: [R(0, 0, 1, 1)] },
  { id: 'bleed', name: 'Во всю страницу', slots: [R(0, 0, 1, 1)], bleed: true },
  { id: 'caption', name: 'С подписью', slots: [R(0, 0, 1, 0.8)], caption: R(0, 0.8, 1, 0.2), captionAt: 'bottom' },
  { id: 'caption-top', name: 'Подпись сверху', slots: [R(0, 0.2, 1, 0.8)], caption: R(0, 0, 1, 0.2), captionAt: 'top', hidden: true },
  { id: 'caption-left', name: 'Подпись слева', slots: [R(0.34, 0, 0.66, 1)], caption: R(0, 0, 0.34, 1), captionAt: 'left', hidden: true },
  { id: 'caption-right', name: 'Подпись справа', slots: [R(0, 0, 0.66, 1)], caption: R(0.66, 0, 0.34, 1), captionAt: 'right', hidden: true },
  { id: 'two-caption', name: 'Два с подписью', slots: [R(0, 0, 0.5, 0.8), R(0.5, 0, 0.5, 0.8)], caption: R(0, 0.8, 1, 0.2), captionAt: 'bottom' },
  { id: 'two-caption-top', name: 'Два, подпись сверху', slots: [R(0, 0.2, 0.5, 0.8), R(0.5, 0.2, 0.5, 0.8)], caption: R(0, 0, 1, 0.2), captionAt: 'top', hidden: true },
  { id: 'two', name: 'Два друг под другом', slots: [R(0, 0, 1, 0.55), R(0, 0.55, 1, 0.45)] },
  { id: 'two-side', name: 'Два рядом', slots: [R(0, 0, 0.5, 1), R(0.5, 0, 0.5, 1)] },
  { id: 'three', name: 'Крупное и два', slots: [R(0, 0, 1, 0.58), R(0, 0.58, 0.5, 0.42), R(0.5, 0.58, 0.5, 0.42)] },
  { id: 'three-left', name: 'Крупное слева', slots: [R(0, 0, 0.6, 1), R(0.6, 0, 0.4, 0.5), R(0.6, 0.5, 0.4, 0.5)] },
  { id: 'three-cols', name: 'Три колонки', slots: [R(0, 0, 1 / 3, 1), R(1 / 3, 0, 1 / 3, 1), R(2 / 3, 0, 1 / 3, 1)] },
  { id: 'four', name: 'Четыре', slots: [R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)] },
  { id: 'four-top', name: 'Крупное и три', slots: [R(0, 0, 1, 0.62), R(0, 0.62, 1 / 3, 0.38), R(1 / 3, 0.62, 1 / 3, 0.38), R(2 / 3, 0.62, 1 / 3, 0.38)] },
];

export const layoutOf = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Что под пальцем: номер фото или -1 — нажали на подпись. */
export function slotAt(id: string, x: number, y: number) {
  const def = layoutOf(id);
  if (def.caption && inside(def.caption, x, y)) return -1;
  return Math.max(0, def.slots.findIndex((r) => inside(r, x, y)));
}

/** Тот же макет с подписью в другом месте: одно фото — сверху, снизу, слева, справа; два — сверху или снизу. */
export function captionLayout(id: string, at: CaptionAt) {
  const two = layoutOf(id).slots.length === 2;
  if (two) return at === 'top' ? 'two-caption-top' : 'two-caption';
  return at === 'bottom' ? 'caption' : `caption-${at}`;
}
/** Какие места для подписи есть у макета. */
export const captionPlaces = (id: string): CaptionAt[] => (layoutOf(id).slots.length === 2 ? ['top', 'bottom'] : ['top', 'bottom', 'left', 'right']);
