/**
 * Каталог с сервера (ТЗ, МП-01: цены не зашиты в интерфейс): тарифы книг, форматы, цены, сроки, фотопечать, доставка.
 * Последний ответ хранится на телефоне: без сети приложение показывает те же цены, что и в прошлый раз.
 * Если сервер ни разу не ответил — цены с сайта из data/demo.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, online } from '@/api/client';
import { applyCatalog, type CatalogDelivery, type CatalogProduct } from '@/data/demo';

const KEY = 'picpac.catalog';
type Saved = { products: CatalogProduct[]; delivery: CatalogDelivery[] };

/** Сначала сохранённый каталог, потом свежий с сервера. Возвращает true, если цены обновились. */
export async function loadCatalog(): Promise<boolean> {
  let changed = false;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      applyCatalog(saved.products, saved.delivery);
      changed = true;
    }
  } catch {}
  try {
    if (!(await online())) return changed;
    const [products, delivery] = await Promise.all([api.get<CatalogProduct[]>('/catalog/products'), api.get<CatalogDelivery[]>('/catalog/delivery')]);
    applyCatalog(products, delivery);
    await AsyncStorage.setItem(KEY, JSON.stringify({ products, delivery } satisfies Saved));
    return true;
  } catch {
    return changed;
  }
}
