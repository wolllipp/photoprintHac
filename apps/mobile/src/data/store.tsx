/**
 * Состояние покупки на клиенте: корзина и оформленные заказы.
 * Позже заменяется вызовами API (POST /orders, GET /orders/{id}).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { points as initialPoints } from '@/data/demo';
import type { Spread } from '@/data/demo';
import type { Pic } from '@/data/photos';

export type TariffId = 'lite' | 'classic' | 'premium' | 'print';

export type CartItem = {
  id: string;
  projectId: string;
  title: string;
  tariff: TariffId;
  tariffName: string;
  format: string;
  pages: number;
  finish: 'Глянец' | 'Зерно';
  price: number;
  readyBy: string;
  cover: Pic;
  /** сколько экземпляров */
  qty: number;
};

/** Допуслуги к заказу: цена фиксированная, добавляется к итогу. */
export const EXTRAS = [
  { id: 'gift', title: 'Подарочная упаковка', sub: 'крафт-коробка и открытка', price: 4.9 },
  { id: 'express', title: 'Сделать быстрее', sub: 'изготовим за 1 день', price: 12 },
] as const;
export type ExtraId = (typeof EXTRAS)[number]['id'];

export const cartTotal = (cart: CartItem[], extras: ExtraId[]) =>
  Math.round((cart.reduce((a, it) => a + it.price * it.qty, 0) + EXTRAS.filter((e) => extras.includes(e.id)).reduce((a, e) => a + e.price, 0)) * 100) / 100;

export type PlacedOrder = {
  id: string;
  title: string;
  tariffName: string;
  total: number;
  readyBy: string;
  placedAt: Date;
  /** только что оплачен — экран заказов показывает подтверждение */
  fresh: boolean;
};

type Store = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'id' | 'qty'>) => void;
  removeFromCart: (id: string) => void;
  /** вернуть удалённую позицию на её место (кнопка «Вернуть») */
  restoreToCart: (item: CartItem, index: number) => void;
  setQty: (id: string, qty: number) => void;
  extras: ExtraId[];
  toggleExtra: (id: ExtraId) => void;
  clearCart: () => void;
  orders: PlacedOrder[];
  placeOrder: (total: number, spentPoints?: number) => PlacedOrder | null;
  points: number;
  markSeen: () => void;
  /** нижнее меню скрыто, пока на главной виден полноэкранный кадр */
  tabBarHidden: boolean;
  setTabBarHidden: (v: boolean) => void;
  /** развороты, поправленные в конструкторе; null — книга как её собрал ИИ */
  design: Spread[] | null;
  setDesign: (d: Spread[]) => void;
  /** показывать приветственный экран на главной (настройка) */
  showIntro: boolean;
  setShowIntro: (v: boolean) => void;
};

const INTRO_KEY = 'picpac.showIntro';

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);
  const [points, setPoints] = useState(initialPoints);
  const [tabBarHidden, setTabBarHidden] = useState(true);
  const [showIntro, setShowIntroState] = useState(true);
  const [design, setDesign] = useState<Spread[] | null>(null);
  const [extras, setExtras] = useState<ExtraId[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(INTRO_KEY)
      .then((v) => {
        if (v === '0') {
          setShowIntroState(false);
          setTabBarHidden(false);
        }
      })
      .catch(() => {});
  }, []);
  const setShowIntro = (v: boolean) => {
    setShowIntroState(v);
    setTabBarHidden(v);
    AsyncStorage.setItem(INTRO_KEY, v ? '1' : '0').catch(() => {});
  };

  const value = useMemo<Store>(
    () => ({
      cart,
      // та же книга с тем же тарифом обновляется на месте, остальное добавляется
      addToCart: (item) =>
        setCart((c) => {
          const id = `${item.projectId}-${item.tariff}`;
          const at = c.findIndex((x) => x.projectId === item.projectId);
          const next = { ...item, id, qty: at >= 0 ? c[at].qty : 1 };
          return at >= 0 ? c.map((x, i) => (i === at ? next : x)) : [...c, next];
        }),
      removeFromCart: (id) => setCart((c) => c.filter((x) => x.id !== id)),
      restoreToCart: (item, index) => setCart((c) => [...c.slice(0, index), item, ...c.slice(index)]),
      setQty: (id, qty) => setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x))),
      extras,
      toggleExtra: (id) => setExtras((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id])),
      clearCart: () => setCart([]),
      orders,
      points,
      tabBarHidden,
      setTabBarHidden,
      showIntro,
      setShowIntro,
      design,
      setDesign,
      markSeen: () => setOrders((o) => o.map((x) => (x.fresh ? { ...x, fresh: false } : x))),
      placeOrder: (total, spentPoints = 0) => {
        const item = cart[0];
        if (!item) return null;
        const order: PlacedOrder = {
          id: String(4792100 + orders.length),
          title: cart.length > 1 ? `${item.title} и ещё ${cart.length - 1}` : item.title,
          tariffName: item.tariffName,
          total,
          readyBy: item.readyBy,
          placedAt: new Date(),
          fresh: true,
        };
        setOrders((o) => [order, ...o]);
        setCart([]);
        setExtras([]);
        if (spentPoints) setPoints((p) => Math.max(0, p - spentPoints));
        return order;
      },
    }),
    [cart, orders, points, tabBarHidden, showIntro, design, extras],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore вне StoreProvider');
  return v;
}

/** Формат цены: «81,09 р.» — единый по всему приложению. */
export const rub = (n: number) => `${n.toFixed(2).replace('.', ',')} р.`;
