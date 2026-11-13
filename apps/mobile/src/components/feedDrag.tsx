/**
 * Перестановка страниц прямо в ленте книги: зажать страницу (долгое нажатие) и тащить вверх-вниз —
 * остальные расступаются, у края экрана лента сама прокручивается. Отдельного экрана нет.
 *
 * Страницы разной высоты (разворот ниже обычной), поэтому высоту каждой меряем по факту (onLayout).
 * Где какая страница стоит, пока тащат, живёт в анимации (positions на UI-потоке); порядок уходит в React
 * только после отпускания — так при отпускании ничего не прыгает (как в components/pageOrder.tsx).
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
  active: SharedValue<number>;
  delta: SharedValue<number>;
  scrollY: SharedValue<number>;
  scrollStart: SharedValue<number>;
  gap: number;
  edges: { top: number; bottom: number };
  onStart: () => void;
  onEdge: (dir: number) => void;
  onDrop: (order: number[]) => void;
};
const Ctx = createContext<Drag | null>(null);

/** Место → какая страница там стоит. */
function orderOf(pos: number[]) {
  'worklet';
  return pos.map((_, i) => i).sort((a, b) => pos[a] - pos[b]);
}

/** Верх каждой страницы по её текущему месту (с зазорами), и верх по исходному порядку. */
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

/**
 * Обёртка ленты. scrollY — прокрутка ленты (обновляет экран в onScroll), scrollBy — прокрутить на dy,
 * edges — где на экране верх и низ ленты (для прокрутки у края), onDrop — новый порядок (место → индекс страницы).
 */
export function FeedDrag({ count, gap, scrollY, edges, scrollBy, onLock, onDrop, children }: { count: number; gap: number; scrollY: SharedValue<number>; edges: { top: number; bottom: number }; scrollBy: (dy: number) => void; onLock: (locked: boolean) => void; onDrop: (order: number[]) => void; children: ReactNode }) {
  const positions = useSharedValue<number[]>(Array.from({ length: count }, (_, i) => i));
  const heights = useSharedValue<number[]>(Array.from({ length: count }, () => 0));
  const active = useSharedValue(-1);
  const delta = useSharedValue(0);
  const scrollStart = useSharedValue(0);

  // число страниц поменялось (добавили, удалили, переставили) — снова исходный порядок
  useEffect(() => {
    positions.set(Array.from({ length: count }, (_, i) => i));
    heights.set(Array.from({ length: count }, (_, i) => heights.get()[i] ?? 0));
  }, [count, positions, heights]);

  // прокрутка у края экрана, пока тащат
  const auto = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEdge = (dir: number) => {
    if (auto.current) clearInterval(auto.current);
    auto.current = dir ? setInterval(() => scrollBy(dir * SPEED), 16) : null;
  };
  useEffect(() => () => {
    if (auto.current) clearInterval(auto.current);
  }, []);

  const value: Drag = {
    positions,
    heights,
    active,
    delta,
    scrollY,
    scrollStart,
    gap,
    edges,
    onStart: () => onLock(true),
    onEdge,
    onDrop: (order) => {
      onEdge(0);
      onLock(false);
      onDrop(order);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Одна страница (или разворот) ленты: index — её номер среди перетаскиваемых. disabled — не тащится. */
export function DragUnit({ index, children }: { index: number; children: ReactNode }) {
  const d = useContext(Ctx)!;
  const { positions, heights, active, delta, scrollY, scrollStart, gap } = d;
  const lifted = useSharedValue(0);

  // пока тащат: где центр страницы под пальцем → на какое место она встаёт, остальные расступаются
  useAnimatedReaction(
    () => (active.get() === index ? delta.get() + scrollY.get() - scrollStart.get() : null),
    (shift) => {
      if (shift === null) return;
      const h = heights.get();
      const natural = topsBy(h.map((_, i) => i), h, gap);
      const center = natural[index] + shift + h[index] / 2;
      // остальные по их местам, без этой страницы: сколько их центров выше — такое и место
      const others = orderOf(positions.get()).filter((i) => i !== index);
      let y = 0;
      let to = 0;
      for (const i of others) {
        if (y + h[i] / 2 < center) to += 1;
        y += h[i] + gap;
      }
      const pos = positions.get();
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
      // страница доезжает до своего места, потом порядок уходит в React
      const h = heights.get();
      const natural = topsBy(h.map((_, i) => i), h, gap);
      const tops = topsBy(orderOf(positions.get()), h, gap);
      const to = tops[index] - natural[index] - (scrollY.get() - scrollStart.get());
      lifted.set(withTiming(0, SLIDE));
      delta.set(
        withTiming(to, SLIDE, () => {
          const order = orderOf(positions.get());
          active.set(-1);
          runOnJS(d.onDrop)(order);
        }),
      );
    });

  const style = useAnimatedStyle(() => {
    const me = active.get() === index;
    const h = heights.get();
    let y = 0;
    if (me) y = delta.get() + scrollY.get() - scrollStart.get();
    else {
      const natural = topsBy(h.map((_, i) => i), h, gap);
      const tops = topsBy(orderOf(positions.get()), h, gap);
      y = withTiming(tops[index] - natural[index], SLIDE);
    }
    return {
      zIndex: me ? 10 : 0,
      transform: [{ translateY: y }, { scale: 1 + lifted.get() * 0.03 }],
      shadowOpacity: lifted.get() * 0.22,
    };
  });

  const measure = (e: LayoutChangeEvent) => {
    const hh = e.nativeEvent.layout.height;
    const cur = heights.get();
    if (cur[index] === hh) return;
    const next = [...cur];
    next[index] = hh;
    heights.set(next);
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View onLayout={measure} style={[{ shadowColor: '#000', shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
