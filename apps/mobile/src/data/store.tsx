/**
 * Состояние покупки на клиенте: корзина и оформленные заказы.
 * Позже заменяется вызовами API (POST /orders, GET /orders/{id}).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { points as initialPoints } from '@/data/demo';
import { cards as demoCards, phoneMasked, type Card, type Spread } from '@/data/demo';
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
  cover: Pic;
  /** этап: 0 принят · 1 проверен · 2 печать · 3 в пути · 4 готов */
  stage: number;
  /** что сейчас происходит на этапе — одной строкой */
  live: string;
};

/** Заказ, который уже в пути (его же показывает плитка на главной). */
const DEMO_ORDER: PlacedOrder = {
  id: '4792088',
  title: 'Юбилей мамы',
  tariffName: 'Classic',
  total: 72.9,
  readyBy: 'завтра',
  placedAt: new Date(2026, 10, 6),
  fresh: false,
  cover: 'bouquet',
  stage: 3,
  live: 'Европочта · ПВЗ №112, Притыцкого, 29',
};

type Store = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'id' | 'qty'>) => void;
  removeFromCart: (id: string) => void;
  /** вернуть удалённую позицию на её место (кнопка «Вернуть») */
  restoreToCart: (item: CartItem, index: number) => void;
  setQty: (id: string, qty: number) => void;
  /** удалённые, но ещё отменяемые позиции (5 секунд на «Вернуть») — в счётчики не входят */
  pending: string[];
  setPending: (fn: (p: string[]) => string[]) => void;
  /** сколько штук в корзине — одно число и для шапки корзины, и для значка на вкладке */
  cartCount: number;
  /** карты оплаты и выбранная; телефон получателя */
  cards: Card[];
  cardId: string;
  setCardId: (id: string) => void;
  addCard: (c: Card) => void;
  phone: string;
  setPhone: (p: string) => void;
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
  const [orders, setOrders] = useState<PlacedOrder[]>([DEMO_ORDER]);
  const [points, setPoints] = useState(initialPoints);
  const [tabBarHidden, setTabBarHidden] = useState(true);
  const [showIntro, setShowIntroState] = useState(true);
  const [design, setDesign] = useState<Spread[] | null>(null);
  const [extras, setExtras] = useState<ExtraId[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [cardList, setCardList] = useState<Card[]>(demoCards);
  const [cardId, setCardId] = useState(demoCards[0].id);
  const [phone, setPhone] = useState(phoneMasked);

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
      // другой тариф, формат или ламинация — отдельная позиция; тот же вариант ещё раз — +1 экземпляр
      addToCart: (item) =>
        setCart((c) => {
          const id = `${item.projectId}-${item.tariff}-${item.format}-${item.finish}`;
          const at = c.findIndex((x) => x.id === id);
          return at >= 0 ? c.map((x, i) => (i === at ? { ...x, qty: Math.min(20, x.qty + 1) } : x)) : [...c, { ...item, id, qty: 1 }];
        }),
      removeFromCart: (id) => setCart((c) => c.filter((x) => x.id !== id)),
      restoreToCart: (item, index) => setCart((c) => [...c.slice(0, index), item, ...c.slice(index)]),
      setQty: (id, qty) => setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, Math.min(20, qty)) } : x))),
      pending,
      setPending,
      cards: cardList,
      cardId,
      setCardId,
      addCard: (c) => {
        setCardList((l) => [...l, c]);
        setCardId(c.id);
      },
      phone,
      setPhone,
      cartCount: cart.filter((x) => !pending.includes(x.id)).reduce((a, x) => a + x.qty, 0),
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
          cover: item.cover,
          stage: 1,
          live: 'макет проверен — ставим в очередь печати',
        };
        setOrders((o) => [order, ...o]);
        setCart([]);
        setExtras([]);
        if (spentPoints) setPoints((p) => Math.max(0, p - spentPoints));
        return order;
      },
    }),
    [cart, orders, points, tabBarHidden, showIntro, design, extras, pending, cardList, cardId, phone],
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
