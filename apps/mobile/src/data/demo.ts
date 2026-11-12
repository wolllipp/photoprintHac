/**
 * Демо-данные главной. Позже заменяются ответом GET /home (notes/14-backend-start.md).
 */
import type { PhotoName } from '@/data/photos';
import type { AlbumTheme, PhotoKey } from '@/theme';

export type Suggestion = {
  id: string;
  photo: PhotoName;
  /** описание на полноэкранном слайде */
  desc: string;
  /** какие фото примерно войдут в книгу — показываем после обложки */
  pages?: PhotoName[];
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
  photo: PhotoName;
  /** метка в стеклянной пилюле на обложке */
  badge: string;
};

export type CurrentOrder = {
  id: string;
  title: string;
  stage: 'accepted' | 'checked' | 'printing' | 'delivery' | 'ready';
  when: string;
};

export const points = 350;

/** Первый — главный черновик в большом блоке главной. */
export const suggestions: Suggestion[] = [
  { id: 'minsk', photo: 'city-sunset', desc: 'Прогулки по осеннему городу — уже разложили лучшие кадры на 24 страницы', title: 'Октябрь в Минске', meta: '86 фото · 24 страницы', pages: ['night-window', 'cafe-interior', 'concert', 'cafe-dessert'], tag: 'черновик готов', tagTone: 'coral', cover: ['g2', 'g6', 'g3'] },
  { id: 'birthday', photo: 'birthday-cake', desc: 'Свечи, торт и все, кто пришёл. Черновик готов — осталось выбрать обложку', title: 'День рождения', meta: '64 фото · 24 стр.', pages: ['friends-night', 'bouquet', 'friends-selfie', 'roses'], tag: 'черновик готов', tagTone: 'coral', cover: ['g5', 'g3', 'g1'] },
  { id: 'friends', photo: 'friends-selfie', desc: '112 снимков с друзьями за осень. Убрали дубли и смазанные', title: 'Мы с друзьями', meta: '112 фото · 32 стр.', pages: ['friends-night', 'cafe-dessert', 'concert', 'city-sunset'], tag: 'черновик готов', tagTone: 'coral', cover: ['g1', 'g4', 'g6'] },
  { id: 'year-2026', photo: 'night-window', desc: 'Весь ваш год в одной книге. Успеем напечатать к Новому году', title: 'Книга года 2026', meta: '1 240 фото · к 20 дек', pages: ['roses', 'city-sunset', 'bouquet', 'cafe-interior'], tag: 'к Новому году', tagTone: 'green', cover: ['g6', 'g1', 'g4'] },
];

export const albums: Album[] = [
  { id: 'concerts', title: 'Концерты', subtitle: 'Classic 20×20 · 12 из 20 страниц', theme: 'default', photo: 'concert', badge: '12 из 20 стр.' },
  { id: 'cafes', title: 'Кофейни', subtitle: 'общий альбом · 6 друзей', theme: 'default', photo: 'cafe-interior', badge: 'общий · 6 друзей' },
  { id: 'flowers', title: 'Цветы', subtitle: 'Lite 20×20 · 41 фото', theme: 'love', photo: 'roses', badge: '41 фото' },
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

/** Цены за 24 страницы формата 20×20 — по таблице super.picpac.by (notes/23-super-alignment.md). */
export const tariffs: Tariff[] = [
  { id: 'lite', name: 'Lite', price: 70, readyBy: '14 ноя', about: 'Lite — тонкие листы, как в журнале', cover: ['#ECC097', '#C8806B'] },
  { id: 'classic', name: 'Classic', price: 87, readyBy: '14 ноя', about: 'Classic — плотные листы, раскрытие на 180°', cover: ['#A9CDD2', '#5C8A88'] },
  { id: 'premium', name: 'Premium', price: 149.5, readyBy: '14 ноя', about: 'Premium — фотобумага 1 мм, без шва по центру', cover: ['#DF948A', '#A9443F'], tall: true },
];

export type Draft = { title: string; pages: number; format: string; photos: number; cover: PhotoName };
/**
 * Цена книги: тариф × формат × страницы × ламинация. Цены, диапазоны и шаг — с super.picpac.by:
 * Lite 24–160 стр., от 70,00 за 24, +2,00 за 2 стр.; Classic 20–60, от 81,00 за 20, +3,00 за 2 стр.;
 * Premium 10–60, от 100,50 за 10, +7,00 за 2 стр. Печать книги — 3 дня с оплаты.
 * ДОПУЩЕНИЕ: надбавки за формат и зернистую ламинацию на сайте не указаны — условные; источник правды — справочник D14.
 */
export const FORMATS_BY_TARIFF: Record<Tariff['id'], string[]> = {
  lite: ['20×20', '26×26', '21×30'],
  classic: ['20×20', '21×30'],
  premium: ['20×20', '30×20', '25×25', '30×30', '21×30'],
};
/** price — за min страниц; step — доплата за каждые 2 страницы сверх min. */
export const BOOK: Record<Tariff['id'], { price: number; min: number; max: number; step: number }> = {
  lite: { price: 70, min: 24, max: 160, step: 2 },
  classic: { price: 81, min: 20, max: 60, step: 3 },
  premium: { price: 100.5, min: 10, max: 60, step: 7 },
};
/** Дней на печать книги — с момента оплаты. */
export const PRINT_DAYS = 3;
/** Число страниц в пределах тарифа, чётное. */
export function fitPages(tariff: Tariff['id'], pages: number) {
  const b = BOOK[tariff];
  return Math.min(b.max, Math.max(b.min, Math.ceil(pages / 2) * 2));
}
const FORMAT_K: Record<string, number> = { '20×20': 1, '21×30': 1.25, '25×25': 1.2, '26×26': 1.2, '30×20': 1.3, '30×30': 1.55 };
export function bookPrice(tariff: Tariff['id'], format: string, pages: number, finish: 'Глянец' | 'Зерно') {
  const b = BOOK[tariff];
  const raw = (b.price + (b.step * (fitPages(tariff, pages) - b.min)) / 2) * (FORMAT_K[format] ?? 1) + (finish === 'Зерно' ? 3 : 0);
  return Math.round(raw * 100) / 100;
}
/** Какой формат взять, если у тарифа выбранного нет. */
export const fitFormat = (tariff: Tariff['id'], format: string) => (FORMATS_BY_TARIFF[tariff].includes(format) ? format : '20×20');

export const drafts: Record<string, Draft> = {
  minsk: { title: 'Октябрь в Минске', pages: 24, format: '20×20', photos: 38, cover: 'city-sunset' },
  birthday: { title: 'День рождения', pages: 20, format: '20×20', photos: 30, cover: 'birthday-cake' },
  friends: { title: 'Мы с друзьями', pages: 32, format: '21×30', photos: 52, cover: 'friends-selfie' },
  karelia: { title: 'Карелия, июль', pages: 24, format: '20×20', photos: 38, cover: 'night-window' },
  'year-2026': { title: 'Книга года 2026', pages: 40, format: '21×30', photos: 96, cover: 'night-window' },
  dacha: { title: 'Дача, август', pages: 24, format: '20×20', photos: 24, cover: 'bouquet' },
  concerts: { title: 'Концерты', pages: 20, format: '20×20', photos: 34, cover: 'concert' },
  cafes: { title: 'Кофейни', pages: 20, format: '20×20', photos: 41, cover: 'cafe-interior' },
  flowers: { title: 'Цветы', pages: 24, format: '20×20', photos: 41, cover: 'roses' },
};

/** Книга листается парами страниц (как раскрытая): раскладка левой и правой страницы и кадры на них. Считаем и продаём — страницами. */
export type PageLayout = 'one' | 'two' | 'three';
/** photos — по рамкам слева направо; null — пустая рамка (в конструкторе). */
export type Spread = { left: PageLayout; right: PageLayout; photos: (PhotoName | null)[]; bg?: string; caption?: string | null };
export const spreads: Spread[] = [
  { left: 'three', right: 'two', photos: ['city-sunset', 'friends-night', 'cafe-dessert', 'night-window', 'friends-selfie'] },
  { left: 'one', right: 'two', photos: ['concert', 'roses', 'bouquet'] },
  { left: 'two', right: 'one', photos: ['cafe-interior', 'birthday-cake', 'friends-night'] },
  { left: 'two', right: 'three', photos: ['night-window', 'city-sunset', 'friends-selfie', 'cafe-dessert', 'concert'] },
];

/* ---------- лента «Ваши книги» на главной ---------- */
/**
 * Только свои напечатанные книги — без чужих людей. Повод вернуться: «год назад», «как вам книга?»,
 * а из каждой карточки — поделиться (+100 пиков за друга) или заказать ещё.
 */
export type Memory = {
  id: string;
  kind: 'yearAgo' | 'arrived' | 'book';
  /** когда напечатана — месяц и год */
  printed: string;
  title: string;
  /** когда напечатана и сколько страниц */
  meta: string;
  pages: PhotoName[];
  tariff: Tariff['id'];
  format: string;
  pageCount: number;
};
export const memories: Memory[] = [
  { id: 'grodno-2025', kind: 'yearAgo', printed: 'ноябрь 2025', title: 'Осень в Гродно', meta: 'Lite · 20×20 · 24 стр.', pages: ['city-sunset', 'night-window', 'cafe-dessert', 'cafe-interior', 'concert', 'roses'], tariff: 'lite', format: '20×20', pageCount: 24 },
  { id: 'grad-2026', kind: 'arrived', printed: 'ноябрь 2026', title: 'Выпускной 11 «Б»', meta: 'Classic · 21×30 · 32 стр.', pages: ['friends-night', 'friends-selfie', 'concert', 'birthday-cake', 'city-sunset'], tariff: 'classic', format: '21×30', pageCount: 32 },
  { id: 'dacha-2026', kind: 'book', printed: 'август 2026', title: 'Лето на даче', meta: 'Classic · 20×20 · 24 стр.', pages: ['bouquet', 'roses', 'birthday-cake', 'cafe-dessert', 'night-window'], tariff: 'classic', format: '20×20', pageCount: 24 },
];

/* ---------- общие альбомы ---------- */
export type SharedAlbum = { id: string; name: string; photo: PhotoName; photos: number; guests: number; status: string; open: boolean };
export const sharedAlbums: SharedAlbum[] = [
  { id: '11b-2026', name: 'Выпускной 11 «Б»', photo: 'friends-night', photos: 44, guests: 7, status: 'сбор фото до 30 ноя', open: true },
  { id: 'cafes', name: 'Кофейни с друзьями', photo: 'cafe-interior', photos: 23, guests: 6, status: 'сбор закрыт · книга заказана', open: false },
];
export const OCCASIONS = ['Юбилей', 'День рождения', 'Свадьба', 'Выпускной', 'Поездка', 'Другое'];

/* ---------- пики ---------- */
/** Правила — notes/16-points.md. Без стартового подарка; имя друга не показываем (персональные данные). */
export const pikHistory = [
  { id: 'h1', title: 'Друг получил первую книгу', sub: 'по вашей ссылке · 3 ноя', amount: 100 },
  { id: 'h2', title: 'Списано при оплате', sub: 'заказ №4792088 · 28 окт', amount: -100 },
  { id: 'h3', title: 'Отзыв о книге', sub: '«Юбилей мамы» · 20 окт', amount: 50 },
  { id: 'h4', title: 'Друг получил первую книгу', sub: 'по вашей ссылке · 2 окт', amount: 100 },
  { id: 'h5', title: 'Друг получил первую книгу', sub: 'по вашей ссылке · 19 сен', amount: 100 },
  { id: 'h6', title: 'Друг получил первую книгу', sub: 'по вашей ссылке · 12 сен', amount: 100 },
];

/* ---------- оформление ---------- */
/** Цены доставки — с сайта (notes/06): Европочта ПВЗ и курьер, Белпочта, EMS. */
export const delivery = [
  { id: 'evropochta', title: 'Европочта · пункт выдачи', sub: 'от 2 дней', price: 5.9 },
  { id: 'courier', title: 'Курьер по Минску', sub: 'в выбранный день, до 22:00', price: 14.9 },
  { id: 'belpochta', title: 'Белпочта', sub: 'в отделение · 3–5 дней', price: 6.9 },
  { id: 'ems', title: 'EMS', sub: 'до двери по Беларуси · 1–2 дня', price: 20.9 },
] as const;

/** Пункты выдачи Европочты рядом (демо). */
export const pickupPoints = [
  { id: 'p112', title: 'ПВЗ №112', address: 'Притыцкого, 29', hours: 'до 21:00', dist: '450 м' },
  { id: 'p87', title: 'ПВЗ №87', address: 'Пушкина, 15', hours: 'до 20:00', dist: '1,2 км' },
  { id: 'p203', title: 'ПВЗ №203', address: 'Тимирязева, 65Б, ТЦ «Замок»', hours: 'до 22:00', dist: '2,8 км' },
];

export const payments = [
  { id: 'card', title: 'Карта', sub: 'сохранённая' },
  { id: 'erip', title: 'ЕРИП', sub: 'номер для оплаты придёт в SMS' },
] as const;

export const phoneMasked = '+375 29 •••-••-67';

/** Сохранённые карты (демо). Цвета — градиент лица карты. */
export type Card = { id: string; brand: 'Visa' | 'Mastercard' | 'Белкарт'; last4: string; bank: string; colors: [string, string] };
export const cards: Card[] = [
  { id: 'c1', brand: 'Visa', last4: '4242', bank: 'Приорбанк', colors: ['#2B2F36', '#596273'] },
  { id: 'c2', brand: 'Mastercard', last4: '5571', bank: 'Беларусбанк', colors: ['#B84F4B', '#E39A86'] },
  { id: 'c3', brand: 'Белкарт', last4: '0938', bank: 'БПС-Сбербанк', colors: ['#1F6F67', '#5CB3A8'] },
];

/** 1 пик = 0,10 р. (Алеся, #30, notes/16-points.md). */
export const PIK_RATE = 0.1;
/** Пиками — не больше 30% стоимости товаров, доставка не входит. */
export const PIK_MAX_SHARE = 0.3;

/** Сколько пиков можно списать с заказа на сумму товаров `goods`. */
export const piksUsable = (balance: number, goods: number) =>
  Math.min(balance, Math.floor((goods * PIK_MAX_SHARE) / PIK_RATE + 1e-9));

/** Первый слайд главной — приветствие. */
export const welcome = {
  photo: 'friends-night' as PhotoName,
  title: 'Добро пожаловать',
  desc: 'Ваши фото из телефона — в готовую книгу за пару минут',
};

/** Плитки-действия главной. Цена «от» — из справочника (D14). */
export const tiles = {
  printFrom: 'от 1,30 р.',
  inviteBonus: '+100 пиков за друга',
};
