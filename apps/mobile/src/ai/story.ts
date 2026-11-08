/**
 * Заглушка разбора описания книги (Story Mode).
 * В продукте это POST /projects/story → parse_story(text) у Марка на локальной LLM.
 * Здесь — простые правила, чтобы экран работал без сервера (DEMO_MODE).
 */
import type { AlbumTheme } from '@/theme';

export type ParsedStory = {
  theme: AlbumTheme;
  themeLabel: string;
  place?: string;
  pages: number;
  tone?: string;
  accent?: string;
  album: string;
  photos: number;
};

const THEMES: { re: RegExp; theme: AlbumTheme; label: string }[] = [
  { re: /поездк|путешеств|отпуск|море|горы|карели/i, theme: 'travel', label: 'Путешествие' },
  { re: /реб[её]н|сын|дочь|малыш|первый год/i, theme: 'child', label: 'Ребёнок' },
  { re: /свадьб/i, theme: 'wedding', label: 'Свадьба' },
  { re: /выпускн/i, theme: 'graduation', label: 'Выпускной' },
  { re: /нов(ый|ого) год/i, theme: 'newyear', label: 'Новый год' },
];

export function parseStory(text: string): ParsedStory | null {
  const t = text.trim();
  if (t.length < 6) return null;
  const th = THEMES.find((x) => x.re.test(t));
  const pagesMatch = t.match(/(\d{2,3})\s*(стр|страниц)/i);
  // \b в JS не понимает кириллицу — граница слова через пробел или начало строки
  const placeMatch = t.match(/(?:^|\s)в\s+([А-ЯЁ][а-яё]+)/);
  const tone = /т[её]пл/i.test(t) ? 'тёплый' : /светл/i.test(t) ? 'светлый' : undefined;
  const accent = /пейзаж/i.test(t) ? 'пейзажи, меньше селфи' : /люд|лиц/i.test(t) ? 'люди и лица' : undefined;
  const place = placeMatch?.[1];
  const pages = pagesMatch ? Math.min(160, Math.max(10, Number(pagesMatch[1]))) : 24;
  return {
    theme: th?.theme ?? 'default',
    themeLabel: th?.label ?? 'Своя тема',
    place,
    pages,
    tone,
    accent,
    album: place ? `${normalizePlace(place)}, июль` : 'Последние фото',
    photos: place ? 214 : 120,
  };
}

/** «Карелию» → «Карелия» (грубо, только для демо). */
function normalizePlace(p: string) {
  return p.replace(/ю$/, 'я').replace(/у$/, 'а');
}
