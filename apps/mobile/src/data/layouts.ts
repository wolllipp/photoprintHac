/**
 * Макеты страниц книги. Каждый — набор прямоугольников в долях страницы (x, y, ширина, высота):
 * по ним страница и рисуется, и понимает, на какое фото нажали. caption — место под подпись (не фото),
 * bleed — фото во всю страницу, без белых полей.
 */
export type Rect = { x: number; y: number; w: number; h: number };
/** Где подпись относительно фото. */
export type CaptionAt = 'top' | 'bottom' | 'left' | 'right';
/** hidden — не показываем в ленте макетов: это та же «с подписью», только подпись в другом месте (выбирается в редакторе подписи). */
/** span: 2 — макет на весь разворот (две страницы): доли считаются от ширины разворота, следующая страница «занята». */
/** over — подпись лежит поверх фото на полупрозрачной плашке; places — где ещё можно поставить подпись в этом макете. */
export type LayoutDef = { id: string; name: string; slots: Rect[]; caption?: Rect; captionAt?: CaptionAt; bleed?: boolean; hidden?: boolean; span?: 2; over?: boolean; places?: CaptionAt[] };

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
  // сквозные: фото через центр разворота — в Classic и Premium шва нет (раскрытие плоское), в Lite по центру шов (review.tsx его показывает)
  { id: 'spread', name: 'На весь разворот', slots: [R(0, 0, 1, 1)], bleed: true, span: 2 },
  { id: 'spread-15', name: 'Полтора листа', slots: [R(0, 0, 0.75, 1), R(0.75, 0, 0.25, 1)], bleed: true, span: 2 },
  { id: 'spread-15-two', name: 'Полтора листа и два', slots: [R(0, 0, 0.75, 1), R(0.75, 0, 0.25, 0.5), R(0.75, 0.5, 0.25, 0.5)], bleed: true, span: 2 },
  { id: 'four-top', name: 'Крупное и три', slots: [R(0, 0, 1, 0.62), R(0, 0.62, 1 / 3, 0.38), R(1 / 3, 0.62, 1 / 3, 0.38), R(2 / 3, 0.62, 1 / 3, 0.38)] },
  // новые шаблоны (план notes/34, по мотивам Shutterfly — только простые): воздух вокруг фото, текст рядом или поверх
  { id: 'margin', name: 'Фото с полями', slots: [R(0.1, 0.1, 0.8, 0.8)] },
  { id: 'small-caption', name: 'Маленькое и подпись', slots: [R(0.2, 0.1, 0.6, 0.6)], caption: R(0.1, 0.74, 0.8, 0.18), captionAt: 'bottom', places: ['bottom'] },
  { id: 'over', name: 'Подпись на фото', slots: [R(0, 0, 1, 1)], bleed: true, caption: R(0.06, 0.74, 0.88, 0.2), captionAt: 'bottom', over: true, places: ['bottom'] },
  { id: 'column', name: 'Фото и текст', slots: [R(0, 0, 0.58, 1)], caption: R(0.62, 0.08, 0.38, 0.84), captionAt: 'right', places: ['right'] },
  { id: 'title-top', name: 'Заголовок над фото', slots: [R(0, 0.26, 1, 0.74)], caption: R(0, 0, 1, 0.22), captionAt: 'top', places: ['top'] },
];

export const layoutOf = (id: string) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
export const isSpread = (id: string) => layoutOf(id).span === 2;

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Что под пальцем: номер фото или -1 — нажали на подпись. slots — размеры, которые человек поменял сам (если есть). */
export function slotAt(id: string, x: number, y: number, slots?: Rect[]) {
  const def = layoutOf(id);
  if (def.caption && inside(def.caption, x, y)) return -1;
  return Math.max(0, (slots ?? def.slots).findIndex((r) => inside(r, x, y)));
}

/**
 * Границы между фото, которые можно двигать: вертикальные (axis x) и горизонтальные (axis y).
 * Граница — место, где одно фото кончается, а другое начинается; from–to — где она тянется поперёк.
 */
export type Edge = { axis: 'x' | 'y'; at: number; from: number; to: number };
const EPS = 0.002;
export function edgesOf(slots: Rect[]): Edge[] {
  const out: Edge[] = [];
  for (const axis of ['x', 'y'] as const) {
    const ends = slots.map((r) => (axis === 'x' ? r.x + r.w : r.y + r.h)).filter((v) => v > EPS && v < 1 - EPS);
    for (const at of [...new Set(ends.map((v) => Math.round(v * 1000) / 1000))]) {
      const touching = slots.filter((r) => {
        const start = axis === 'x' ? r.x : r.y;
        const end = axis === 'x' ? r.x + r.w : r.y + r.h;
        return Math.abs(start - at) < EPS || Math.abs(end - at) < EPS;
      });
      if (!slots.some((r) => Math.abs((axis === 'x' ? r.x : r.y) - at) < EPS)) continue;
      const from = Math.min(...touching.map((r) => (axis === 'x' ? r.y : r.x)));
      const to = Math.max(...touching.map((r) => (axis === 'x' ? r.y + r.h : r.x + r.w)));
      out.push({ axis, at, from, to });
    }
  }
  return out;
}

/** Самое маленькое фото на странице — 15% её стороны: меньше не разглядеть и не напечатать. */
const MIN_SIDE = 0.15;
/** Сдвинуть границу: фото по одну сторону растут, по другую — уменьшаются; не меньше MIN_SIDE. */
export function moveEdge(slots: Rect[], edge: Edge, to: number): Rect[] {
  const key = edge.axis === 'x' ? 'x' : 'y';
  const size = edge.axis === 'x' ? 'w' : 'h';
  // насколько можно сдвинуть, чтобы ни одно фото не стало меньше минимума
  let lo = 0;
  let hi = 1;
  for (const r of slots) {
    if (Math.abs(r[key] + r[size] - edge.at) < EPS) lo = Math.max(lo, r[key] + MIN_SIDE);
    if (Math.abs(r[key] - edge.at) < EPS) hi = Math.min(hi, r[key] + r[size] - MIN_SIDE);
  }
  const v = Math.min(Math.max(to, lo), hi);
  return slots.map((r) => {
    if (Math.abs(r[key] + r[size] - edge.at) < EPS) return { ...r, [size]: v - r[key] };
    if (Math.abs(r[key] - edge.at) < EPS) return { ...r, [key]: v, [size]: r[key] + r[size] - v };
    return r;
  });
}

/** Тот же макет с подписью в другом месте: одно фото — сверху, снизу, слева, справа; два — сверху или снизу. */
export function captionLayout(id: string, at: CaptionAt) {
  // у шаблона с одним местом для подписи (поверх фото, колонка, заголовок) — тот же шаблон
  if (layoutOf(id).places) return id;
  const two = layoutOf(id).slots.length === 2;
  if (two) return at === 'top' ? 'two-caption-top' : 'two-caption';
  return at === 'bottom' ? 'caption' : `caption-${at}`;
}
/** Какие места для подписи есть у макета. */
export const captionPlaces = (id: string): CaptionAt[] => layoutOf(id).places ?? (layoutOf(id).slots.length === 2 ? ['top', 'bottom'] : ['top', 'bottom', 'left', 'right']);
