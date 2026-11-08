/**
 * Состояние покупки на клиенте: корзина и оформленные заказы.
 * Позже заменяется вызовами API (POST /orders, GET /orders/{id}).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PhotoKey } from '@/theme';

export type TariffId = 'lite' | 'classic' | 'premium';

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
  cover: PhotoKey;
};

export type PlacedOrder = {
  id: string;
  title: string;
  tariffName: string;
  total: number;
  readyBy: string;
  placedAt: Date;
};

type Store = {
  cart: CartItem[];
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  clearCart: () => void;
  orders: PlacedOrder[];
  placeOrder: (total: number) => PlacedOrder | null;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<PlacedOrder[]>([]);

  const value = useMemo<Store>(
    () => ({
      cart,
      // в демо одна книга в корзине: повторное добавление заменяет её
      addToCart: (item) => setCart([{ ...item, id: `${item.projectId}-${item.tariff}` }]),
      clearCart: () => setCart([]),
      orders,
      placeOrder: (total) => {
        const item = cart[0];
        if (!item) return null;
        const order: PlacedOrder = {
          id: '4792100',
          title: item.title,
          tariffName: item.tariffName,
          total,
          readyBy: item.readyBy,
          placedAt: new Date(),
        };
        setOrders((o) => [order, ...o]);
        setCart([]);
        return order;
      },
    }),
    [cart, orders],
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
