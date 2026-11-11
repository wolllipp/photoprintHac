/**
 * Поводы для книги: ближайшие праздники и личные даты из календаря телефона (дни рождения, годовщины).
 * Календарь читается только на телефоне и только после разрешения; на сервер события не уходят.
 * Для каждого повода считаем крайний день заказа: печать книги 3 дня + доставка Европочтой до 3 дней.
 */
import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import { PRINT_DAYS } from '@/data/demo';

export type OccasionKind = 'birthday' | 'newyear' | 'love' | 'family' | 'other';
export type Occasion = {
  id: string;
  title: string;
  date: Date;
  kind: OccasionKind;
  /** откуда взяли: общий праздник или событие из календаря человека */
  source: 'holiday' | 'calendar';
  /** крайний день заказа, чтобы книга успела к дате */
  orderBy: Date;
  /** сколько дней осталось до крайнего дня заказа (0 — сегодня последний) */
  daysToOrder: number;
};

const DAY = 86_400_000;
/** Доставка Европочтой в пункт выдачи — 2–3 дня (super.picpac.by); берём верхнюю границу. */
const DELIVERY_DAYS = 3;
const LEAD_DAYS = PRINT_DAYS + DELIVERY_DAYS;
/** На сколько дней вперёд смотрим. */
const AHEAD_DAYS = 120;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY);

/** Общие праздники, к которым чаще всего дарят книги: [месяц с нуля, день, название, вид]. */
const HOLIDAYS: [number, number, string, OccasionKind][] = [
  [11, 31, 'Новый год', 'newyear'],
  [1, 14, 'День влюблённых', 'love'],
  [2, 8, '8 Марта', 'family'],
  [9, 14, 'День матери', 'family'],
];

function make(id: string, title: string, date: Date, kind: OccasionKind, source: Occasion['source'], today: Date): Occasion | null {
  const orderBy = new Date(midnight(date).getTime() - LEAD_DAYS * DAY);
  const daysToOrder = daysBetween(today, orderBy);
  // к дате уже не успеть — не предлагаем
  if (daysToOrder < 0) return null;
  return { id, title, date: midnight(date), kind, source, orderBy, daysToOrder };
}

export function holidays(today = new Date()): Occasion[] {
  const out: Occasion[] = [];
  for (const [m, d, title, kind] of HOLIDAYS) {
    let date = new Date(today.getFullYear(), m, d);
    if (daysBetween(today, date) < 0) date = new Date(today.getFullYear() + 1, m, d);
    if (daysBetween(today, date) > AHEAD_DAYS) continue;
    const o = make(`holiday-${m}-${d}`, title, date, kind, 'holiday', today);
    if (o) out.push(o);
  }
  return out;
}

const PERSONAL = /рожд|\bд\.\s?р\.?|birthday|юбилей|годовщин|anniversar|свадьб|wedding|выпускн|крестин|именин/i;
const kindOf = (title: string, birthdays: boolean): OccasionKind =>
  birthdays || /рожд|birthday|юбилей|именин/i.test(title) ? 'birthday' : /годовщин|anniversar|свадьб|wedding/i.test(title) ? 'love' : 'other';

export const calendarSupported = Platform.OS !== 'web';

/** Разрешение уже дано? Спрашивать не будем — только проверяем. */
export async function calendarGranted() {
  if (!calendarSupported) return false;
  return (await Calendar.getCalendarPermissionsAsync()).granted;
}

/** Показать системный вопрос о доступе к календарю. */
export async function askCalendar() {
  if (!calendarSupported) return false;
  return (await Calendar.requestCalendarPermissionsAsync()).granted;
}

/** Личные даты из календаря: календарь «Дни рождения» целиком и события с подходящими словами в названии. */
export async function personalOccasions(today = new Date()): Promise<Occasion[]> {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  if (!cals.length) return [];
  const birthdayCals = new Set(cals.filter((c) => c.type === Calendar.CalendarType.BIRTHDAYS).map((c) => c.id));
  const from = midnight(today);
  const events = await Calendar.getEventsAsync(cals.map((c) => c.id), from, new Date(from.getTime() + AHEAD_DAYS * DAY));
  const seen = new Set<string>();
  const out: Occasion[] = [];
  for (const e of events) {
    const title = (e.title ?? '').trim();
    const inBirthdays = birthdayCals.has(e.calendarId);
    if (!title || !(inBirthdays || PERSONAL.test(title))) continue;
    // Новый год у нас уже есть в общих праздниках
    if (/нов(ый|ого|ому) год/i.test(title)) continue;
    const date = new Date(e.startDate);
    const key = `${title.toLowerCase()}|${midnight(date).getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const o = make(`cal-${key}`, title, date, kindOf(title, inBirthdays), 'calendar', today);
    if (o) out.push(o);
  }
  return out;
}

export const byDate = (a: Occasion, b: Occasion) => a.date.getTime() - b.date.getTime();

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const monthShort = (d: Date) => MONTHS[d.getMonth()];
export const dayMonth = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
export const daysWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней');

/** Что предложить к поводу: готовую книгу или фразу для сборки (какие фото искать). */
export function presetFor(o: Occasion): { book: string } | { phrase: string } {
  if (o.kind === 'newyear') return { book: 'year-2026' };
  if (o.kind === 'birthday') return { phrase: `Книга в подарок: ${o.title}. Фото с этим человеком за год, тёплая, 24 страницы, больше людей` };
  if (o.kind === 'love') return { phrase: `Книга к дате: ${o.title}. Наши общие фото за год, тёплая, 24 страницы, больше людей` };
  if (o.kind === 'family') return { phrase: `Книга в подарок: ${o.title}. Семейные фото за год, светлая, 24 страницы, больше людей` };
  return { phrase: `Книга к событию: ${o.title}. Лучшие фото, 24 страницы` };
}
