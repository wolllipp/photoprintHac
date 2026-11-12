/**
 * Чтобы одно и то же фото не попало дважды. Системная галерея не умеет показывать уже выбранные снимки отмеченными,
 * а адрес файла при каждом выборе новый — поэтому узнаём фото по его id в галерее (или имени, размеру и разрешению).
 */
import * as ImagePicker from 'expo-image-picker';

const keyOfUri = new Map<string, string>();

const keyOf = (a: ImagePicker.ImagePickerAsset) => a.assetId ?? `${a.fileName ?? ''}|${a.fileSize ?? ''}|${a.width}x${a.height}`;

/** Запомнить, какие снимки галереи стоят за адресами файлов. */
export function rememberAssets(assets: ImagePicker.ImagePickerAsset[]) {
  assets.forEach((a) => keyOfUri.set(a.uri, keyOf(a)));
}

/** Это те же снимки? (по адресу файла — через запомненный id в галерее) */
export const samePhoto = (a: string, b: string) => a === b || (!!keyOfUri.get(a) && keyOfUri.get(a) === keyOfUri.get(b));

/**
 * Выбрать фото в галерее и отбросить те, что уже выбраны (have — адреса уже выбранных).
 * Возвращает новые адреса и сколько повторов пропустили; null — человек закрыл галерею.
 */
export async function pickPhotos(have: string[], options: { multiple?: boolean } = {}) {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: options.multiple ?? true, quality: 1 });
  if (res.canceled || !res.assets.length) return null;
  rememberAssets(res.assets);
  const known = new Set(have.map((u) => keyOfUri.get(u) ?? u));
  const fresh: string[] = [];
  let dup = 0;
  for (const a of res.assets) {
    const k = keyOf(a);
    if (known.has(k)) {
      dup += 1;
      continue;
    }
    known.add(k);
    fresh.push(a.uri);
  }
  return { fresh, dup };
}

export const dupText = (n: number) => `${n} ${n === 1 ? 'фото уже было выбрано' : 'фото уже были выбраны'} — не добавили повторно`;
