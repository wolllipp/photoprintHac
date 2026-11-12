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
export const pic = (k: Pic) => {
  if (k in photos) return photos[k as PhotoName];
  if (k.startsWith('srv:') && remote) return remote(k.slice(4));
  return { uri: k };
};
