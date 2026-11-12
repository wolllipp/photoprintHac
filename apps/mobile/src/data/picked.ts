/**
 * Чтобы одно и то же фото не попало дважды. Системная галерея не умеет показывать уже выбранные снимки отмеченными,
 * а адрес файла при каждом выборе новый — поэтому узнаём фото по его id в галерее (или имени, размеру и разрешению).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { setPreview } from '@/data/photos';

/** Длинная сторона копии для экрана: страница книги на телефоне — около 1200 точек. */
const PREVIEW_PX = 1200;

/** Уменьшенная копия для экрана; не вышло — показываем оригинал, как раньше. */
async function makePreview(a: ImagePicker.ImagePickerAsset) {
  const long = Math.max(a.width || 0, a.height || 0);
  if (!long || long <= PREVIEW_PX * 1.2) return;
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    ctx.resize(a.width >= a.height ? { width: PREVIEW_PX } : { height: PREVIEW_PX });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    setPreview(a.uri, out.uri);
  } catch {
    // оригинал тоже покажется, просто тяжелее
  }
}

/** Длинная сторона копии для печати: 3000 px на книге 20×20 — около 380 dpi, с запасом выше требований печати. */
const UPLOAD_PX = 3000;
/** Когда снято (из EXIF галереи): сжатая копия EXIF теряет, а сервер раскладывает книгу по дням. */
const takenOfUri = new Map<string, string>();
export const takenAt = (uri: string) => takenOfUri.get(uri);
const uploadOfUri = new Map<string, string>();

/**
 * Что отправить на сервер: оригинал айфона — 3–10 МБ, а для печати хватает 3000 px (≈1 МБ) —
 * загрузка в разы быстрее. Не вышло сжать — отправляем оригинал.
 */
export async function uploadCopy(uri: string) {
  const ready = uploadOfUri.get(uri);
  if (ready) return ready;
  const size = sizeOfUri.get(uri);
  const long = size ? Math.max(size.w, size.h) : 0;
  if (!size || long <= UPLOAD_PX * 1.1) return uri;
  try {
    const ctx = ImageManipulator.manipulate(uri);
    ctx.resize(size.w >= size.h ? { width: UPLOAD_PX } : { height: UPLOAD_PX });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.88, format: SaveFormat.JPEG });
    uploadOfUri.set(uri, out.uri);
    return out.uri;
  } catch {
    return uri;
  }
}

/** Копии по 3 за раз: первые ждём (их сразу видно на экране сборки), остальные доделываются, пока фото грузятся. */
async function makePreviews(assets: ImagePicker.ImagePickerAsset[], waitFirst = 6) {
  const queue = [...assets];
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) await makePreview(a);
  };
  const first = assets.slice(0, waitFirst);
  queue.splice(0, first.length);
  await Promise.all(first.map(makePreview));
  void Promise.all([worker(), worker(), worker()]);
}

const keyOfUri = new Map<string, string>();
/** Размер снимка в пикселях — для проверки перед заказом (хватит ли разрешения для рамки). */
const sizeOfUri = new Map<string, { w: number; h: number }>();
export const photoSize = (uri: string) => sizeOfUri.get(uri);

/** Какие форматы печатаем (как на сервере: services/api/app/api/photos.py, ALLOWED). */
const OK_TYPES = /^image\/(jpe?g|png|heic|heif|webp)$/i;
const OK_EXT = /\.(jpe?g|png|heic|heif|webp)$/i;
const formatOf = (a: ImagePicker.ImagePickerAsset) => (a.mimeType?.split('/')[1] ?? a.fileName?.split('.').pop() ?? 'неизвестный').toUpperCase();
const supported = (a: ImagePicker.ImagePickerAsset) => (a.mimeType ? OK_TYPES.test(a.mimeType) : a.fileName ? OK_EXT.test(a.fileName) : true);

const keyOf = (a: ImagePicker.ImagePickerAsset) => a.assetId ?? `${a.fileName ?? ''}|${a.fileSize ?? ''}|${a.width}x${a.height}`;

/** Запомнить, какие снимки галереи стоят за адресами файлов. */
export function rememberAssets(assets: ImagePicker.ImagePickerAsset[]) {
  assets.forEach((a) => {
    keyOfUri.set(a.uri, keyOf(a));
    if (a.width && a.height) sizeOfUri.set(a.uri, { w: a.width, h: a.height });
    const exif = a.exif as Record<string, unknown> | null | undefined;
    const raw = (exif?.DateTimeOriginal ?? (exif?.['{Exif}'] as Record<string, unknown> | undefined)?.DateTimeOriginal) as string | undefined;
    if (typeof raw === 'string') takenOfUri.set(a.uri, raw);
  });
}

/** Это те же снимки? (по адресу файла — через запомненный id в галерее) */
export const samePhoto = (a: string, b: string) => a === b || (!!keyOfUri.get(a) && keyOfUri.get(a) === keyOfUri.get(b));

/**
 * Выбрать фото в галерее и отбросить те, что уже выбраны (have — адреса уже выбранных).
 * Возвращает новые адреса, сколько повторов пропустили и какие форматы не печатаем (GIF, RAW…); null — человек закрыл галерею.
 */
export async function pickPhotos(have: string[], options: { multiple?: boolean } = {}) {
  // exif — ради даты съёмки (раскладка книги по дням)
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: options.multiple ?? true, quality: 1, exif: true });
  if (res.canceled || !res.assets.length) return null;
  rememberAssets(res.assets);
  const known = new Set(have.map((u) => keyOfUri.get(u) ?? u));
  const fresh: string[] = [];
  let dup = 0;
  const bad: string[] = [];
  for (const a of res.assets) {
    if (!supported(a)) {
      bad.push(formatOf(a));
      continue;
    }
    const k = keyOf(a);
    if (known.has(k)) {
      dup += 1;
      continue;
    }
    known.add(k);
    fresh.push(a.uri);
  }
  await makePreviews(res.assets.filter((a) => fresh.includes(a.uri)));
  return { fresh, dup, bad };
}

/** Что пропустили при выборе — одной строкой: повторы и форматы, которые не печатаем. */
export function skipText(p: { dup: number; bad?: string[] }) {
  const parts: string[] = [];
  if (p.bad?.length) {
    const kinds = [...new Set(p.bad)].join(', ');
    parts.push(`${p.bad.length} фото в формате ${kinds} не добавили — печатаем JPEG, PNG и HEIC`);
  }
  if (p.dup) parts.push(dupText(p.dup));
  return parts.length ? parts.join('. ') : null;
}

export const dupText = (n: number) => `${n} ${n === 1 ? 'фото уже было выбрано' : 'фото уже были выбраны'} — не добавили повторно`;
