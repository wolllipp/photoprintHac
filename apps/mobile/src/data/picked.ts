/**
 * Чтобы одно и то же фото не попало дважды. Системная галерея не умеет показывать уже выбранные снимки отмеченными,
 * а адрес файла при каждом выборе новый — поэтому узнаём фото по его id в галерее (или имени, размеру и разрешению).
 */
import * as ImagePicker from 'expo-image-picker';

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
  });
}

/** Это те же снимки? (по адресу файла — через запомненный id в галерее) */
export const samePhoto = (a: string, b: string) => a === b || (!!keyOfUri.get(a) && keyOfUri.get(a) === keyOfUri.get(b));

/**
 * Выбрать фото в галерее и отбросить те, что уже выбраны (have — адреса уже выбранных).
 * Возвращает новые адреса, сколько повторов пропустили и какие форматы не печатаем (GIF, RAW…); null — человек закрыл галерею.
 */
export async function pickPhotos(have: string[], options: { multiple?: boolean } = {}) {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: options.multiple ?? true, quality: 1 });
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
