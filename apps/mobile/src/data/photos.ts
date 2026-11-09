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
export const pic = (k: Pic) => (k in photos ? photos[k as PhotoName] : { uri: k });
