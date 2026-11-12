/**
 * Состояние покупки на клиенте: что сейчас оформляем, черновики и оформленные заказы.
 * Корзины нет (стратегия трека 2, notes/25): «Заказать» сразу ведёт на оформление, а незаконченное лежит в «Черновиках».
 * cart — это то, что оформляется прямо сейчас (одна книга, печать или повтор заказа).
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
  /** фотопечать: какие фото (адреса на телефоне) и сколько копий каждого */
  prints?: { uri: string; qty: number }[];
};

/** Допуслуги к заказу: цена фиксированная, добавляется к итогу. */
export const EXTRAS = [
  { id: 'gift', title: 'Подарочная упаковка', sub: 'крафт-коробка и открытка', price: 4.9 },
  { id: 'express', title: 'Сделать быстрее', sub: 'изготовим за 1 день', price: 12 },
] as const;
export type ExtraId = (typeof EXTRAS)[number]['id'];

export const cartTotal = (cart: CartItem[], extras: ExtraId[]) =>
  Math.round((cart.reduce((a, it) => a + it.price * it.qty, 0) + EXTRAS.filter((e) => extras.includes(e.id)).reduce((a, e) => a + e.price, 0)) * 100) / 100;

/** Адрес доставки до двери (курьер, Белпочта, EMS). */
export type Address = { street: string; flat: string; entrance: string; note: string };
/** Доставка по умолчанию — из профиля; оформление открывается с ней. */
export type DeliveryPref = { deliveryId: string; pointId: string; address: Address | null };

export type LastBook = { title: string; cover: Pic; params: Record<string, string>; at: number };

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
  /** что было в заказе — для «Повторить» */
  items?: CartItem[];
  /** этап: 0 принят · 1 проверен · 2 печать · 3 в пути · 4 готов */
  stage: number;
  /** заказ создан на сервере — его id там (статус подтягиваем оттуда) */
  serverId?: string;
  /** что сейчас происходит на этапе — одной строкой */
  live: string;
  /** обращения в поддержку по этому заказу */
  support?: SupportTicket[];
};
export type SupportTicket = { number: number; topic: string; text: string; at: number; status: 'open' | 'answered' | 'closed'; slaHours: number };

/** Заказ, который уже в пути (его же показывает плитка на главной). */
/** Уже полученные заказы — те же книги, что в ленте «Ваши книги» на главной. */
const DONE_ORDERS: PlacedOrder[] = [
  { id: '4791930', title: 'Выпускной 11 «Б»', tariffName: 'Classic', total: 104.65, readyBy: '5 ноя', placedAt: new Date(2026, 10, 2), fresh: false, cover: 'friends-night', stage: 4, live: 'получен 5 ноя · Европочта, ПВЗ №112',
    items: [{ id: 'grad-classic-21×30-Глянец', projectId: 'grad-2026', title: 'Выпускной 11 «Б»', tariff: 'classic', tariffName: 'Classic', format: '21×30', pages: 32, finish: 'Глянец', price: 104.65, readyBy: '5 ноя', cover: 'friends-night', qty: 1 }] },
  { id: '4790412', title: 'Лето на даче', tariffName: 'Classic', total: 87, readyBy: '21 авг', placedAt: new Date(2026, 7, 18), fresh: false, cover: 'bouquet', stage: 4, live: 'получен 21 авг · Белпочта',
    items: [{ id: 'dacha-classic-20×20-Глянец', projectId: 'dacha-2026', title: 'Лето на даче', tariff: 'classic', tariffName: 'Classic', format: '20×20', pages: 24, finish: 'Глянец', price: 87, readyBy: '21 авг', cover: 'bouquet', qty: 1 }] },
];

const DEMO_ORDER: PlacedOrder = {
  id: '4792088',
  title: 'Юбилей мамы',
  tariffName: 'Classic',
  total: 87,
  readyBy: 'завтра',
  placedAt: new Date(2026, 10, 6),
  fresh: false,
  cover: 'bouquet',
  stage: 3,
  live: 'Европочта · ПВЗ №112, Притыцкого, 29',
  items: [{ id: 'mama-classic-20×20-Глянец', projectId: 'mama', title: 'Юбилей мамы', tariff: 'classic', tariffName: 'Classic', format: '20×20', pages: 24, finish: 'Глянец', price: 87, readyBy: '14 ноя', cover: 'bouquet', qty: 1 }],
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
  /** имя в профиле */
  name: string;
  setName: (v: string) => void;
  delivery: DeliveryPref;
  setDelivery: (d: DeliveryPref) => void;
  /** убрать сохранённую карту */
  removeCard: (id: string) => void;
  /** согласие на обработку фото ИИ (A14) */
  /** брошенная сборка: книга дошла до превью, но не попала в корзину (A11) */
  /** подсказка жестов при просмотре книги («→ нравится · ← поменять») уже показана */
  gesturesSeen: boolean;
  /** накопленный вкус (notes/25, раздел 9): что человек менял свайпом влево — учитываем в следующей книге */
  taste: string[];
  addTaste: (t: string) => void;
  setGesturesSeen: (v: boolean) => void;
  lastBook: LastBook | null;
  setLastBook: (b: LastBook | null) => void;
  aiConsent: boolean;
  setAiConsent: (v: boolean) => void;
  setPhone: (p: string) => void;
  extras: ExtraId[];
  toggleExtra: (id: ExtraId) => void;
  clearCart: () => void;
  orders: PlacedOrder[];
  placeOrder: (total: number, spentPoints?: number, server?: { id: string; number: number }) => PlacedOrder | null;
  /** этап заказа обновился на сервере */
  setOrderStage: (id: string, stage: number) => void;
  addSupport: (orderId: string, t: SupportTicket) => void;
  /** «Повторить»: состав заказа — сразу на оформление */
  repeatOrder: (id: string) => number;
  /** «Заказать»: эта позиция и есть заказ — без корзины, сразу на оформление */
  orderNow: (item: Omit<CartItem, 'id' | 'qty'>) => void;
  /** черновики: книги, которые человек начал (открыл), но не заказал; id книги → когда начал.
   *  Предложения ИИ в кружках сюда не попадают, пока их не открыли. */
  started: Record<string, number>;
  startDraft: (id: string) => void;
  /** книги, собранные на сервере: что показать в «Черновиках» (название, обложка, объём, формат, фото) */
  serverDrafts: Record<string, { title: string; cover: Pic; pages: number; format: string; photos: number }>;
  saveServerDraft: (id: string, d: { title: string; cover: Pic; pages: number; format: string; photos: number }) => void;
  /** черновики, которые человек убрал */
  hiddenDrafts: string[];
  hideDraft: (id: string) => void;
  points: number;
  /** начислить пики (отзыв о книге и т. п.) */
  addPoints: (n: number) => void;
  markSeen: () => void;
  /** лист «Создать» открыт — плюсом в нижнем меню или кружком на главной */
  creating: boolean;
  setCreating: (v: boolean) => void;
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
const STATE_KEY = 'picpac.state.v1';

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<PlacedOrder[]>([DEMO_ORDER, ...DONE_ORDERS]);
  const [points, setPoints] = useState(initialPoints);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const [showIntro, setShowIntroState] = useState(true);
  const [design, setDesign] = useState<Spread[] | null>(null);
  const [extras, setExtras] = useState<ExtraId[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [cardList, setCardList] = useState<Card[]>(demoCards);
  const [cardId, setCardId] = useState(demoCards[0].id);
  const [phone, setPhone] = useState(phoneMasked);
  const [name, setName] = useState('Иван');
  const [delivery, setDelivery] = useState<DeliveryPref>({ deliveryId: 'evropochta', pointId: 'p112', address: null });
  const [aiConsent, setAiConsent] = useState(false);
  const [lastBook, setLastBook] = useState<LastBook | null>(null);
  const [gesturesSeen, setGesturesSeen] = useState(false);
  const [hiddenDrafts, setHiddenDrafts] = useState<string[]>([]);
  const [taste, setTaste] = useState<string[]>([]);
  const [serverDrafts, setServerDrafts] = useState<Store['serverDrafts']>({});
  const [creating, setCreating] = useState(false);
  // демо: одну книгу человек начал неделю назад и бросил
  const [started, setStarted] = useState<Record<string, number>>(() => ({ concerts: Date.now() - 6 * 86_400_000 }));

  // восстановить всё после перезапуска; пока не прочитали — не перезаписываем сохранённое
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(STATE_KEY)
      .then((raw) => {
        if (!raw) return;
        const v = JSON.parse(raw);
        if (Array.isArray(v.cart)) setCart(v.cart);
        if (Array.isArray(v.orders) && v.orders.length) {
          const saved: PlacedOrder[] = v.orders.map((o: PlacedOrder) => ({ ...o, placedAt: new Date(o.placedAt), fresh: false }));
          // демо-история полученных заказов появляется и у тех, кто уже открывал приложение раньше
          setOrders([...saved, ...DONE_ORDERS.filter((d) => !saved.some((x) => x.id === d.id))]);
        }
        if (typeof v.points === 'number') setPoints(v.points);
        if (Array.isArray(v.extras)) setExtras(v.extras);
        if (Array.isArray(v.cards) && v.cards.length) setCardList(v.cards);
        if (typeof v.cardId === 'string') setCardId(v.cardId);
        if (typeof v.phone === 'string') setPhone(v.phone);
        if (typeof v.name === 'string') setName(v.name);
        if (v.delivery && typeof v.delivery === 'object') setDelivery(v.delivery);
        if (typeof v.aiConsent === 'boolean') setAiConsent(v.aiConsent);
        if (v.lastBook) setLastBook(v.lastBook);
        // подсказка теперь про свайпы в книге — старый флаг от корзины не считаем
        if (v.reviewHint) setGesturesSeen(true);
        if (Array.isArray(v.hiddenDrafts)) setHiddenDrafts(v.hiddenDrafts);
        if (Array.isArray(v.taste)) setTaste(v.taste);
        if (v.serverDrafts && typeof v.serverDrafts === 'object') setServerDrafts(v.serverDrafts);
        if (v.started && typeof v.started === 'object') setStarted(v.started);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!loaded) return;
    // удалённые в ожидании отмены не сохраняем
    const keep = cart.filter((x) => !pending.includes(x.id));
    AsyncStorage.setItem(STATE_KEY, JSON.stringify({ cart: keep, orders, points, extras, cards: cardList, cardId, phone, aiConsent, lastBook, reviewHint: gesturesSeen, hiddenDrafts, started, taste, name, delivery, serverDrafts })).catch(() => {});
  }, [loaded, cart, pending, orders, points, extras, cardList, cardId, phone, aiConsent, lastBook, gesturesSeen, hiddenDrafts, started, taste, name, delivery, serverDrafts]);

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
      name,
      setName,
      delivery,
      setDelivery,
      removeCard: (id) => {
        setCardList((l) => {
          const next = l.filter((c) => c.id !== id);
          if (cardId === id && next[0]) setCardId(next[0].id);
          return next;
        });
      },
      aiConsent,
      lastBook,
      gesturesSeen,
      setGesturesSeen,
      setLastBook,
      setAiConsent,
      cartCount: cart.filter((x) => !pending.includes(x.id)).reduce((a, x) => a + x.qty, 0),
      extras,
      toggleExtra: (id) => setExtras((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id])),
      clearCart: () => setCart([]),
      orders,
      points,
      addPoints: (n) => setPoints((p) => p + n),
      creating,
      setCreating,
      tabBarHidden,
      setTabBarHidden,
      showIntro,
      setShowIntro,
      design,
      setDesign,
      markSeen: () => setOrders((o) => o.map((x) => (x.fresh ? { ...x, fresh: false } : x))),
      repeatOrder: (id) => {
        const items = orders.find((x) => x.id === id)?.items ?? [];
        setCart(items);
        setExtras([]);
        return items.length;
      },
      orderNow: (item) => {
        setCart([{ ...item, id: `${item.projectId}-${item.tariff}-${item.format}-${item.finish}`, qty: 1 }]);
        setExtras([]);
      },
      started,
      serverDrafts,
      saveServerDraft: (id, d) => setServerDrafts((x) => (JSON.stringify(x[id]) === JSON.stringify(d) ? x : { ...x, [id]: d })),
      taste,
      addTaste: (t) => setTaste((x) => (x.includes(t) ? x : [...x, t])),
      // открыли книгу снова — она опять черновик, даже если раньше её убрали или заказали
      startDraft: (id) => {
        setStarted((st) => ({ ...st, [id]: Date.now() }));
        setHiddenDrafts((h) => (h.includes(id) ? h.filter((x) => x !== id) : h));
      },
      hiddenDrafts,
      hideDraft: (id) => setHiddenDrafts((h) => (h.includes(id) ? h : [...h, id])),
      setOrderStage: (id, stage) => setOrders((o) => o.map((x) => (x.id === id && x.stage !== stage ? { ...x, stage } : x))),
      addSupport: (orderId, t) => setOrders((o) => o.map((x) => (x.id === orderId ? { ...x, support: [t, ...(x.support ?? [])] } : x))),
      placeOrder: (total, spentPoints = 0, server) => {
        const item = cart[0];
        if (!item) return null;
        const order: PlacedOrder = {
          id: server ? String(server.number) : String(4792100 + orders.length),
          serverId: server?.id,
          title: cart.length > 1 ? `${item.title} и ещё ${cart.length - 1}` : item.title,
          tariffName: item.tariffName,
          total,
          readyBy: item.readyBy,
          placedAt: new Date(),
          fresh: true,
          cover: item.cover,
          stage: 1,
          live: 'макет проверен — ставим в очередь печати',
          items: cart,
        };
        setOrders((o) => [order, ...o]);
        setCart([]);
        setExtras([]);
        // оформили книгу — из черновиков она уходит
        setHiddenDrafts((h) => (h.includes(item.projectId) ? h : [...h, item.projectId]));
        // в демо незаконченная книга одна — заказали книгу, значит, «Продолжить книгу» больше не нужно
        if (item.tariff !== 'print') setLastBook(null);
        if (spentPoints) setPoints((p) => Math.max(0, p - spentPoints));
        return order;
      },
    }),
    [cart, orders, points, tabBarHidden, showIntro, design, extras, pending, cardList, cardId, phone, aiConsent, lastBook, gesturesSeen, hiddenDrafts, started, taste, creating, name, delivery, serverDrafts],
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
