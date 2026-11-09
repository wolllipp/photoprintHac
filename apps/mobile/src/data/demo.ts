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
  { id: 'minsk', photo: 'city-sunset', desc: 'Прогулки по осеннему городу — уже разложили лучшие кадры на 24 страницы', title: 'Октябрь в Минске', meta: '86 фото · 24 страницы', tag: 'черновик готов', tagTone: 'coral', cover: ['g2', 'g6', 'g3'] },
  { id: 'birthday', photo: 'birthday-cake', desc: 'Свечи, торт и все, кто пришёл. Черновик готов — осталось выбрать обложку', title: 'День рождения', meta: '64 фото · 20 стр.', tag: 'черновик готов', tagTone: 'coral', cover: ['g5', 'g3', 'g1'] },
  { id: 'friends', photo: 'friends-selfie', desc: '112 снимков с друзьями за осень. Убрали дубли и смазанные', title: 'Мы с друзьями', meta: '112 фото · 32 стр.', tag: 'черновик готов', tagTone: 'coral', cover: ['g1', 'g4', 'g6'] },
  { id: 'year-2026', photo: 'night-window', desc: 'Весь ваш год в одной книге. Успеем напечатать к Новому году', title: 'Книга года 2026', meta: '1 240 фото · к 20 дек', tag: 'к Новому году', tagTone: 'green', cover: ['g6', 'g1', 'g4'] },
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

/** Цены за 24 страницы иллюстративные; источник правды — справочник D14 (бэкенд). */
export const tariffs: Tariff[] = [
  { id: 'lite', name: 'Lite', price: 62.4, readyBy: '13 ноя', about: 'Lite — тонкие листы, как в журнале', cover: ['#ECC097', '#C8806B'] },
  { id: 'classic', name: 'Classic', price: 81.09, readyBy: '14 ноя', about: 'Classic — плотные листы, раскрытие на 180°', cover: ['#A9CDD2', '#5C8A88'] },
  { id: 'premium', name: 'Premium', price: 96.6, readyBy: '15 ноя', about: 'Premium — фотобумага 1 мм, без шва по центру', cover: ['#DF948A', '#A9443F'], tall: true },
];

export const drafts: Record<string, { title: string; pages: number; format: string; photos: number }> = {
  minsk: { title: 'Октябрь в Минске', pages: 24, format: '20×20', photos: 38 },
  birthday: { title: 'День рождения', pages: 20, format: '20×20', photos: 30 },
  friends: { title: 'Мы с друзьями', pages: 32, format: '21×30', photos: 52 },
  karelia: { title: 'Карелия, июль', pages: 24, format: '20×20', photos: 38 },
  'year-2026': { title: 'Книга года 2026', pages: 40, format: '21×30', photos: 96 },
  dacha: { title: 'Дача, август', pages: 16, format: '20×20', photos: 24 },
};

/* ---------- оформление ---------- */
export const delivery = [
  { id: 'evropochta', title: 'Мой пункт · Европочта', sub: 'ПВЗ №112, Притыцкого, 29 · от 2 дней', price: 5.9 },
  { id: 'courier', title: 'Курьер по Минску', sub: 'в выбранный день', price: 14.9 },
] as const;

export const phoneMasked = '+375 29 •••-••-67';

/** Цена пика пока не утверждена (Алеся, #30) — условно 1 пик = 0,01 р. */
export const PIK_RATE = 0.01;

/** Первый слайд главной — приветствие. */
export const welcome = {
  photo: 'friends-night' as PhotoName,
  title: 'Добро пожаловать',
  desc: 'Ваши фото из телефона — в готовую книгу за пару минут',
};

/** Плитки-действия главной. Цена «от» — из справочника (D14). */
export const tiles = {
  printFrom: 'от 0,49 р.',
  inviteBonus: '+100 пиков за друга',
};
