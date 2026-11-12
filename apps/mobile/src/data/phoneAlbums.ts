/**
 * Альбомы с телефона — подборками в кружках на главной (как демо-идеи) и на экране «Мои альбомы».
 * Доступ к фото — только после нажатия (кружок «Ваши альбомы»); список альбомов остаётся на телефоне.
 * На сервер уходят фото только того альбома, из которого человек решил собрать книгу.
 */
import * as MediaLibrary from 'expo-media-library/legacy';

import { collageTariff, startBook } from '@/components/tabBar';
import { tariffs, type Suggestion } from '@/data/demo';
import { rememberLibrary } from '@/data/picked';

/** Сколько фото альбома берём в книгу: последние 80 — больше на 24–60 страниц не встанет коллажами. */
export const ALBUM_TAKE = 80;
/** Меньше — книгу не собрать (самая маленькая — Premium на 10 страниц). */
export const ALBUM_MIN = 10;
/** Префикс id подборки-альбома: так главная отличает её от демо-идеи. */
export const ALBUM_PREFIX = 'album:';

const byId = new Map<string, MediaLibrary.Album>();

/** Служебные альбомы айфона — не подборки для книги (по-русски и по-английски). */
const NOT_FOR_BOOKS =
  /screenshot|снимк\S* экрана|скриншот|screen ?record|запис\S* экрана|recently deleted|недавно удал|hidden|скрыт|burst|сери[ия]|video|видео|slo-?mo|замедл|time-?lapse|таймлапс|animated|анимир|\braw\b|import|импорт|duplicate|дубликат|document|документ|receipt|чек/i;

/**
 * Хорошее фото для книги и превью: снимок камеры, а не скриншот; не меньше 2 Мпикс; обычные пропорции
 * (не длинная полоса экрана или панорамы). Скриншоты айфон помечает сам (mediaSubtypes: screenshot).
 */
function goodPhoto(a: MediaLibrary.Asset) {
  if (a.mediaSubtypes?.includes('screenshot')) return false;
  if (!a.width || !a.height || a.width * a.height < 2_000_000) return false;
  const r = a.width / a.height;
  return r > 0.55 && r < 1.9;
}

/** Обложка — самое крупное по разрешению из хороших; превью — из разных частей альбома, а не подряд. */
function pickShow(good: MediaLibrary.Asset[]) {
  const cover = [...good].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const rest = good.filter((a) => a !== cover);
  const step = Math.max(1, Math.floor(rest.length / 4));
  const pages = [0, 1, 2, 3].map((i) => rest[i * step]).filter((a): a is MediaLibrary.Asset => !!a);
  return { cover: cover?.uri, pages: pages.map((a) => a.uri) };
}

/** Доступ к фото уже дали? (не спрашивает) */
export async function albumsAllowed() {
  return (await MediaLibrary.getPermissionsAsync().catch(() => null))?.granted ?? false;
}

/** Спросить доступ к фото — только по нажатию человека. */
export async function askAlbums() {
  return (await MediaLibrary.requestPermissionsAsync().catch(() => null))?.granted ?? false;
}

/** Альбомы телефона: свои и умные («Избранное», «Недавние», люди, места), где хотя бы 10 фото; самые большие — первыми. */
export async function phoneAlbums(limit = 8) {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const big = albums
    .filter((a) => a.assetCount >= ALBUM_MIN && !NOT_FOR_BOOKS.test(a.title))
    .sort((a, b) => b.assetCount - a.assetCount)
    .slice(0, limit * 2);
  const out = await Promise.all(
    big.map(async (a) => {
      byId.set(a.id, a);
      // смотрим 60 свежих: из них — только хорошие фото (без скриншотов и мелких картинок)
      const page = await MediaLibrary.getAssetsAsync({ album: a, first: 60, mediaType: 'photo', sortBy: [['creationTime', false]] }).catch(() => null);
      const good = (page?.assets ?? []).filter(goodPhoto);
      const show = pickShow(good);
      return { id: a.id, title: a.title, count: a.assetCount, good: good.length, photos: show.cover ? [show.cover, ...show.pages] : [] };
    }),
  );
  // альбом, где хороших фото меньше, чем на самую маленькую книгу, — не подборка
  return out.filter((x) => x.photos.length && x.good >= ALBUM_MIN).slice(0, limit);
}

/** Альбомы — подборками для кружков на главной (тот же вид, что демо-идеи). */
export async function albumSuggestions(): Promise<Suggestion[]> {
  const list = await phoneAlbums();
  return list.map((a) => {
    const t = collageTariff(Math.min(a.count, ALBUM_TAKE));
    const name = tariffs.find((x) => x.id === t)?.name ?? 'Lite';
    return {
      id: `${ALBUM_PREFIX}${a.id}`,
      photo: a.photos[0],
      pages: a.photos.slice(1, 5),
      title: a.title,
      desc: `${a.count} фото в альбоме — соберём книгу коллажами из последних ${Math.min(a.count, ALBUM_TAKE)}`,
      meta: `${a.count} фото · ${name}`,
      tag: 'ваш альбом',
      tagTone: 'green',
      cover: ['g1', 'g2', 'g3'],
      source: 'phone',
    } satisfies Suggestion;
  });
}

/**
 * Собрать книгу из альбома: последние фото → файлы на телефоне (ph:// → file://) → копии для экрана →
 * тариф под коллажи → экран сборки. Бросает ошибку с понятным текстом.
 */
export async function bookFromAlbum(albumId: string, title: string) {
  const album = byId.get(albumId) ?? (await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true })).find((a) => a.id === albumId);
  if (!album) throw new Error('Альбом не найден — обновите главную');
  // берём с запасом и отбрасываем скриншоты и мелкие картинки — в книгу только хорошие фото
  const page = await MediaLibrary.getAssetsAsync({ album, first: ALBUM_TAKE * 2, mediaType: 'photo', sortBy: [['creationTime', false]] });
  const files: { uri: string; width: number; height: number; creationTime: number }[] = [];
  const queue = page.assets.filter(goodPhoto).slice(0, ALBUM_TAKE);
  const worker = async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      const info = await MediaLibrary.getAssetInfoAsync(a).catch(() => null);
      if (info?.localUri) files.push({ uri: info.localUri, width: a.width, height: a.height, creationTime: a.creationTime });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  files.sort((a, b) => a.creationTime - b.creationTime);
  const tariff = collageTariff(files.length);
  if (!tariff) throw new Error(`В альбоме «${title}» мало фото на телефоне — нужно хотя бы ${ALBUM_MIN}`);
  const uris = await rememberLibrary(files);
  startBook(uris, tariff, title);
}
