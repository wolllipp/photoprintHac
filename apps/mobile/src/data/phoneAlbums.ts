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
  const big = albums.filter((a) => a.assetCount >= ALBUM_MIN).sort((a, b) => b.assetCount - a.assetCount).slice(0, limit);
  const out = await Promise.all(
    big.map(async (a) => {
      byId.set(a.id, a);
      // обложка и пара фото для просмотра — самые свежие
      const page = await MediaLibrary.getAssetsAsync({ album: a, first: 5, mediaType: 'photo', sortBy: [['creationTime', false]] }).catch(() => null);
      return { id: a.id, title: a.title, count: a.assetCount, photos: page?.assets.map((x) => x.uri) ?? [] };
    }),
  );
  return out.filter((x) => x.photos.length);
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
  const page = await MediaLibrary.getAssetsAsync({ album, first: ALBUM_TAKE, mediaType: 'photo', sortBy: [['creationTime', false]] });
  const files: { uri: string; width: number; height: number; creationTime: number }[] = [];
  const queue = [...page.assets];
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
