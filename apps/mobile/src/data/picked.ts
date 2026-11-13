/**
 * Чтобы одно и то же фото не попало дважды. Системная галерея не умеет показывать уже выбранные снимки отмеченными,
 * а адрес файла при каждом выборе новый — поэтому узнаём фото по его id в галерее (или имени, размеру и разрешению).
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';

import { previewFile, setPreview } from '@/data/photos';

/** Длинная сторона копии для экрана: страница книги на телефоне — около 1200 точек. */
const PREVIEW_PX = 1200;

/** Что нужно знать о снимке для копий: адрес и размер. */
type Shot = { uri: string; width: number; height: number };

/**
 * Фото из альбома айфона (экран «Мои альбомы»): запоминаем размер и дату съёмки, как у выбранных в галерее,
 * и готовим уменьшенные копии для экрана. Возвращает адреса.
 */
export async function rememberLibrary(items: { uri: string; width: number; height: number; creationTime: number }[]) {
  const two = (n: number) => String(n).padStart(2, '0');
  items.forEach((a) => {
    sizeOfUri.set(a.uri, { w: a.width, h: a.height });
    if (a.creationTime) {
      const d = new Date(a.creationTime);
      takenOfUri.set(a.uri, `${d.getFullYear()}:${two(d.getMonth() + 1)}:${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`);
    }
  });
  await makePreviews(items);
  return items.map((a) => a.uri);
}

/**
 * Уменьшить снимок и сохранить JPEG. Строго по одному за раз на всё приложение: снимок айфона на 12–48 Мпикс
 * при обработке занимает в памяти сотни мегабайт, и когда копии для экрана и для печати делались параллельно
 * (да ещё рядом редактор с сотней фото), iOS закрывал приложение посреди фоновой догрузки.
 * Память нативных объектов отдаём сразу (release), не дожидаясь сборщика мусора.
 */
let shrinkChain: Promise<unknown> = Promise.resolve();
function shrink(uri: string, size: { w: number; h: number }, px: number, compress: number) {
  const run = async () => {
    const ctx = ImageManipulator.manipulate(uri);
    let img: Awaited<ReturnType<typeof ctx.renderAsync>> | null = null;
    try {
      ctx.resize(size.w >= size.h ? { width: px } : { height: px });
      img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress, format: SaveFormat.JPEG });
      return out.uri;
    } finally {
      img?.release();
      ctx.release();
    }
  };
  const p = shrinkChain.then(run, run);
  shrinkChain = p.catch(() => {});
  return p;
}

/** Копия для экрана уже делается — второй раз то же фото не обрабатываем, ждём ту же. */
const previewJobs = new Map<string, Promise<void>>();
/** Уменьшенная копия для экрана; не вышло — показываем оригинал, как раньше. */
function makePreview(a: Shot) {
  const long = Math.max(a.width || 0, a.height || 0);
  if (!long || long <= PREVIEW_PX * 1.2 || previewFile(a.uri)) return Promise.resolve();
  let job = previewJobs.get(a.uri);
  if (!job) {
    job = shrink(a.uri, { w: a.width, h: a.height }, PREVIEW_PX, 0.8)
      .then((out) => {
        setPreview(a.uri, out);
      })
      .catch(() => {
        // оригинал тоже покажется, просто тяжелее
      })
      .finally(() => previewJobs.delete(a.uri));
    previewJobs.set(a.uri, job);
  }
  return job;
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
  // размер неизвестен (фото не из галереи, а, например, из «Файлов») — узнаём, а не шлём оригинал на 10 МБ
  const size = sizeOfUri.get(uri) ?? (await measure(uri));
  const long = size ? Math.max(size.w, size.h) : 0;
  if (!size || long <= UPLOAD_PX * 1.1) return uri;
  try {
    const out = await shrink(uri, size, UPLOAD_PX, 0.88);
    uploadOfUri.set(uri, out);
    return out;
  } catch {
    return uri;
  }
}

/**
 * Размер снимка, если галерея его не дала: читаем по заголовку файла (Image.getSize), не распаковывая
 * снимок целиком (раньше распаковывали — ещё сотни мегабайт). Не вышло — undefined.
 */
async function measure(uri: string) {
  try {
    const { width, height } = await Image.getSize(uri);
    if (!width || !height) return undefined;
    const size = { w: width, h: height };
    sizeOfUri.set(uri, size);
    return size;
  } catch {
    return undefined;
  }
}

/**
 * Черновая загрузка для быстрой сборки: копия 1200 px для экрана (она уже готова — makePreviews) и размер,
 * который будет у копии для печати. Сервер считает по нему качество под рамку, а саму копию для печати
 * приложение догружает в фоне (api/book.ts, uploadPrints). null — фото и так небольшое, грузим сразу целиком.
 */
export async function draftCopy(uri: string): Promise<{ file: string; printW: number; printH: number } | null> {
  const size = sizeOfUri.get(uri) ?? (await measure(uri));
  if (!size) return null;
  const long = Math.max(size.w, size.h);
  if (long <= PREVIEW_PX * 1.2) return null;
  let file = previewFile(uri);
  if (!file) {
    await makePreview({ uri, width: size.w, height: size.h });
    file = previewFile(uri);
  }
  if (!file) return null;
  // копия для печати — не больше 3000 px по длинной стороне (uploadCopy), пропорции те же
  const k = long > UPLOAD_PX * 1.1 ? UPLOAD_PX / long : 1;
  return { file, printW: Math.round(size.w * k), printH: Math.round(size.h * k) };
}

/**
 * Копии для экрана: первые ждём (их сразу видно на экране сборки), остальные доделываются в фоне.
 * Все — через общую очередь shrink (по одному снимку за раз).
 */
async function makePreviews(assets: Shot[], waitFirst = 6) {
  const first = assets.slice(0, waitFirst);
  const rest = assets.slice(waitFirst);
  await Promise.all(first.map(makePreview));
  rest.forEach((a) => void makePreview(a));
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
