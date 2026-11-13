/**
 * Перестановка страниц прямо в ленте книги: зажать страницу (долгое нажатие) и тащить вверх-вниз —
 * остальные расступаются, у края экрана лента сама прокручивается. Отдельного экрана нет.
 *
 * Пока ничего не тащат, здесь ничего не считается: на книге в 100 фото пересчёт позиций всех страниц
 * на каждый замер высоты (как было сначала) перегружал телефон при открытии книги.
 * Высоты страниц меряем по факту (onLayout) и копим в обычном массиве; сдвиги остальных страниц
 * (offsets) считаются один раз на всю ленту и только во время перетаскивания. Порядок уходит в React после
 * отпускания, потом сдвиги обнуляются.
 */
import * as Haptics from 'expo-haptics';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

const SLIDE = { duration: 200 };
/** У края экрана (pt) лента начинает прокручиваться; скорость — pt за кадр. */
const EDGE = 90;
const SPEED = 14;

type Drag = {
  positions: SharedValue<number[]>;
  heights: SharedValue<number[]>;
  offsets: SharedValue<number[]>;
  active: SharedValue<number>;
  delta: SharedValue<number>;
  scrollY: SharedValue<number>;
  scrollStart: SharedValue<number>;
  gap: number;
  edges: { top: number; bottom: number };
  measured: (index: number, h: number) => void;
  onStart: () => void;
  onEdge: (dir: number) => void;
  onDrop: (order: number[]) => void;
  onCancel: () => void;
};
const Ctx = createContext<Drag | null>(null);

/** Место → какая страница там стоит. */
function orderOf(pos: number[]) {
  'worklet';
  return pos.map((_, i) => i).sort((a, b) => pos[a] - pos[b]);
}

/** Верх каждой страницы, если стоят в таком порядке (с зазорами). */
function topsBy(order: number[], heights: number[], gap: number) {
  'worklet';
  const tops: number[] = new Array(heights.length).fill(0);
  let y = 0;
  for (const i of order) {
    tops[i] = y;
    y += (heights[i] ?? 0) + gap;
  }
  return tops;
}

/** 0, 1, 2… — исходный порядок. Вызывается и в потоке анимаций, поэтому worklet. */
function identity(n: number) {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i);
  return out;
}

/**
 * Обёртка ленты. scrollY — прокрутка ленты (обновляет экран в onScroll), scrollBy — прокрутить на dy,
 * edges — где на экране верх и низ ленты (для прокрутки у края), onDrop — новый порядок (место → индекс страницы).
 */
export function FeedDrag({ count, gap, scrollY, edges, scrollBy, onLock, onDrop, children }: { count: number; gap: number; scrollY: SharedValue<number>; edges: { top: number; bottom: number }; scrollBy: (dy: number) => void; onLock: (locked: boolean) => void; onDrop: (order: number[]) => void; children: ReactNode }) {
  const positions = useSharedValue<number[]>(identity(count));
  const heights = useSharedValue<number[]>([]);
  const offsets = useSharedValue<number[]>([]);
  const active = useSharedValue(-1);
  const delta = useSharedValue(0);
  const scrollStart = useSharedValue(0);

  // высоты копятся здесь и уходят в анимацию одним пакетом за кадр, а не на каждый замер каждой страницы
  const hs = useRef<number[]>([]);
  const flush = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const measured = (index: number, h: number) => {
    if (hs.current[index] === h) return;
    hs.current[index] = h;
    if (flush.current !== null) return;
    flush.current = requestAnimationFrame(() => {
      flush.current = null;
      heights.set(Array.from({ length: count }, (_, i) => hs.current[i] ?? 0));
    });
  };

  // число страниц поменялось (книга догрузилась, добавили или удалили страницу) — исходный порядок, без сдвигов
  useEffect(() => {
    hs.current.length = count;
    positions.set(identity(count));
    offsets.set([]);
    heights.set(Array.from({ length: count }, (_, i) => hs.current[i] ?? 0));
  }, [count, positions, offsets, heights]);

  // сдвиги остальных страниц — только пока тащат и только когда меняется порядок
  useAnimatedReaction(
    () => (active.get() >= 0 ? positions.get() : null),
    (pos) => {
      if (!pos) return;
      const h = heights.get();
      if (h.length !== pos.length) return;
      const natural = topsBy(identity(pos.length), h, gap);
      const tops = topsBy(orderOf(pos), h, gap);
      offsets.set(tops.map((t, i) => t - natural[i]));
    },
  );

  // прокрутка у края экрана, пока тащат
  const auto = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEdge = (dir: number) => {
    if (auto.current) clearInterval(auto.current);
    auto.current = dir ? setInterval(() => scrollBy(dir * SPEED), 16) : null;
  };
  useEffect(
    () => () => {
      if (auto.current) clearInterval(auto.current);
      if (flush.current !== null) cancelAnimationFrame(flush.current);
    },
    [],
  );

  const reset = () => {
    onEdge(0);
    onLock(false);
    positions.set(identity(count));
    offsets.set([]);
  };
  const value: Drag = {
    positions,
    heights,
    offsets,
    active,
    delta,
    scrollY,
    scrollStart,
    gap,
    edges,
    measured,
    onStart: () => onLock(true),
    onEdge,
    onDrop: (order) => {
      onDrop(order);
      // React уже переставил страницы — сдвиги больше не нужны
      reset();
    },
    onCancel: reset,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Одна страница (или разворот) ленты: index — её номер среди перетаскиваемых. */
export function DragUnit({ index, children }: { index: number; children: ReactNode }) {
  const d = useContext(Ctx)!;
  const { positions, heights, offsets, active, delta, scrollY, scrollStart, gap } = d;
  const lifted = useSharedValue(0);

  // пока тащат именно эту: где её центр под пальцем → на какое место встаёт
  useAnimatedReaction(
    () => (active.get() === index ? delta.get() + scrollY.get() - scrollStart.get() : null),
    (shift) => {
      if (shift === null) return;
      const h = heights.get();
      const pos = positions.get();
      if (h.length !== pos.length || index >= h.length) return;
      let natural = 0;
      for (let i = 0; i < index; i++) natural += h[i] + gap;
      const center = natural + shift + h[index] / 2;
      // остальные по их местам, без этой страницы: сколько их центров выше — такое и место
      const others = orderOf(pos).filter((i) => i !== index);
      let y = 0;
      let to = 0;
      for (const i of others) {
        if (y + h[i] / 2 < center) to += 1;
        y += h[i] + gap;
      }
      if (pos[index] === to) return;
      const next = [...others.slice(0, to), index, ...others.slice(to)];
      const out = new Array(pos.length).fill(0);
      next.forEach((i, slot) => (out[i] = slot));
      positions.set(out);
      runOnJS(Haptics.selectionAsync)();
    },
  );

  const pan = Gesture.Pan()
    .activateAfterLongPress(380)
    .onStart(() => {
      active.set(index);
      delta.set(0);
      scrollStart.set(scrollY.get());
      lifted.set(withSpring(1, { damping: 20, stiffness: 260 }));
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      runOnJS(d.onStart)();
    })
    .onUpdate((e) => {
      delta.set(e.translationY);
      const dir = e.absoluteY < d.edges.top + EDGE ? -1 : e.absoluteY > d.edges.bottom - EDGE ? 1 : 0;
      runOnJS(d.onEdge)(dir);
    })
    .onFinalize(() => {
      if (active.get() !== index) return;
      const h = heights.get();
      const pos = positions.get();
      if (h.length !== pos.length) {
        // пока тащили, число страниц поменялось — отменяем перетаскивание, лента снова листается
        active.set(-1);
        delta.set(0);
        lifted.set(0);
        runOnJS(d.onCancel)();
        return;
      }
      // страница доезжает до своего места, потом порядок уходит в React
      const natural = topsBy(identity(pos.length), h, gap);
      const tops = topsBy(orderOf(pos), h, gap);
      const to = tops[index] - natural[index] - (scrollY.get() - scrollStart.get());
      lifted.set(withTiming(0, SLIDE));
      delta.set(
        withTiming(Number.isFinite(to) ? to : 0, SLIDE, () => {
          const order = orderOf(positions.get());
          active.set(-1);
          delta.set(0);
          runOnJS(d.onDrop)(order);
        }),
      );
    });

  const style = useAnimatedStyle(() => {
    const me = active.get() === index;
    let y = 0;
    if (me) y = delta.get() + scrollY.get() - scrollStart.get();
    else {
      const off = offsets.get();
      // никто не тащит — сдвигов нет, ничего не считаем
      y = off.length ? withTiming(off[index] ?? 0, SLIDE) : 0;
    }
    // NaN в transform на iOS роняет приложение целиком — на всякий случай
    if (!Number.isFinite(y)) y = 0;
    const l = lifted.get();
    return {
      zIndex: me ? 10 : 0,
      transform: [{ translateY: y }, { scale: 1 + l * 0.03 }],
      shadowOpacity: l * 0.22,
    };
  });

  const measure = (e: LayoutChangeEvent) => d.measured(index, e.nativeEvent.layout.height);

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={measure} style={[{ shadowColor: '#000', shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
