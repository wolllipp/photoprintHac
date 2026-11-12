/**
 * Демо-фото (свои снимки команды, уменьшены до 1400 px). В продукте — фото пользователя с телефона.
 */
export const photos = {
  'city-sunset': require('../../assets/demo/city-sunset.jpg'),
  'birthday-cake': require('../../assets/demo/birthday-cake.jpg'),
  'friends-selfie': require('../../assets/demo/friends-selfie.jpg'),
  'friends-night': require('../../assets/demo/friends-night.jpg'),
  'cafe-dessert': require('../../assets/demo/cafe-dessert.jpg'),
  'cafe-interior': require('../../assets/demo/cafe-interior.jpg'),
  bouquet: require('../../assets/demo/bouquet.jpg'),
  roses: require('../../assets/demo/roses.jpg'),
  'night-window': require('../../assets/demo/night-window.jpg'),
  concert: require('../../assets/demo/concert.jpg'),
} as const;

export type PhotoName = keyof typeof photos;

/** Снимок: имя демо-фото или адрес фото, которое человек выбрал в галерее. */
export type Pic = PhotoName | (string & {});
/** Фото, которое есть только на сервере («srv:<id>»): адрес и заголовок с токеном даёт слой запросов (api/client). */
let remote: ((id: string) => { uri: string; headers?: Record<string, string> }) | null = null;
export const setRemoteSource = (fn: typeof remote) => {
  remote = fn;
};
/**
 * Уменьшенная копия фото из галереи — для экрана (data/picked.ts). Снимок айфона — 12 Мпикс: 25–30 таких в книге
 * телефон не тянет, и редактор зависал. На сервер и в печать уходит оригинал, а показываем копию.
 */
const previewOf = new Map<string, string>();
export const setPreview = (uri: string, preview: string) => previewOf.set(uri, preview);

export const pic = (k: Pic) => {
  if (k in photos) return photos[k as PhotoName];
  const preview = previewOf.get(k);
  if (preview) return { uri: preview };
  if (k.startsWith('srv:') && remote) return remote(k.slice(4));
  return { uri: k };
};
