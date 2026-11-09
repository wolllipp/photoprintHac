/**
 * Состояние покупки на клиенте: корзина и оформленные заказы.
 * Позже заменяется вызовами API (POST /orders, GET /orders/{id}).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { points as initialPoints } from '@/data/demo';
import type { Spread } from '@/data/demo';
import type { PhotoName } from '@/data/photos';

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
  cover: PhotoName;
};

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
  addToCart: (item: Omit<CartItem, 'id'>) => void;
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
      // в демо одна книга в корзине: повторное добавление заменяет её
      addToCart: (item) => setCart([{ ...item, id: `${item.projectId}-${item.tariff}` }]),
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
          id: '4792100',
          title: item.title,
          tariffName: item.tariffName,
          total,
          readyBy: item.readyBy,
          placedAt: new Date(),
          fresh: true,
        };
        setOrders((o) => [order, ...o]);
        setCart([]);
        if (spentPoints) setPoints((p) => Math.max(0, p - spentPoints));
        return order;
      },
    }),
    [cart, orders, points, tabBarHidden, showIntro, design],
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
