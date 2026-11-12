/**
 * «Порядок страниц» — сетка уменьшенных страниц: зажать страницу и перетащить на новое место, остальные расступаются.
 * Разворот на две страницы двигается целиком (одна плитка). Открывается долгим нажатием на страницу в книге.
 * Порядок применяется по «Готово»; «Отмена» — всё как было.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

/** Плитка: что нарисовать (уменьшенная страница) и подпись («стр. 3», «стр. 4–5»). */
export type OrderItem = { key: string; label: string; wide?: boolean; render: (w: number, h: number) => ReactNode };

const COLS = 3;
const GAP = 10;
const LABEL_H = 22;

export function PageOrder({ items, aspect, onDone, onClose }: { items: OrderItem[]; aspect: number; onDone: (order: number[]) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellW = (width - 32 - GAP * (COLS - 1)) / COLS;
  const thumbH = cellW / aspect;
  const cellH = thumbH + LABEL_H + GAP;
  // order[i] — какая плитка (индекс в items) стоит на месте i
  const [order, setOrder] = useState(() => items.map((_, i) => i));
  const [moved, setMoved] = useState(false);
  // что тащат и куда: место, откуда взяли, и куда сейчас встанет
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);

  const move = (a: number, b: number) => {
    if (a === b) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setOrder((o) => {
      const next = [...o];
      const [x] = next.splice(a, 1);
      next.splice(b, 0, x);
      return next;
    });
    setMoved(true);
  };
  const rows = Math.ceil(items.length / COLS);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={[s.screen, { paddingTop: insets.top + 10 }]}>
        <View style={s.head}>
          <Tap onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={s.headBtn}>Отмена</Text>
          </Tap>
          <Text style={s.title}>Порядок страниц</Text>
          <Tap onPress={() => onDone(order)} hitSlop={10} accessibilityRole="button" accessibilityState={{ disabled: !moved }}>
            <Text style={[s.headBtn, s.headDone, !moved && { opacity: 0.4 }]}>Готово</Text>
          </Tap>
        </View>
        <Text style={s.hint}>Зажмите страницу и перетащите на новое место</Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ height: rows * cellH }}>
            {order.map((item, place) => (
              <Cell
                key={items[item].key}
                place={place}
                count={order.length}
                cellW={cellW}
                cellH={cellH}
                from={from}
                to={to}
                onMove={move}
                label={items[item].label}
                wide={items[item].wide}>
                {items[item].render(cellW, thumbH)}
              </Cell>
            ))}
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Где стоит место i в сетке. */
function at(i: number, cellW: number, cellH: number) {
  'worklet';
  return { x: (i % COLS) * (cellW + GAP), y: Math.floor(i / COLS) * cellH };
}

function Cell({ place, count, cellW, cellH, from, to, onMove, label, wide, children }: { place: number; count: number; cellW: number; cellH: number; from: SharedValue<number>; to: SharedValue<number>; onMove: (a: number, b: number) => void; label: string; wide?: boolean; children: ReactNode }) {
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const lifted = useSharedValue(0);
  // встала на новое место — сдвиг пальцем больше не нужен
  useEffect(() => {
    dx.set(0);
    dy.set(0);
  }, [place, dx, dy]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      from.set(place);
      to.set(place);
      lifted.set(withSpring(1, { damping: 18 }));
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      dx.set(e.translationX);
      dy.set(e.translationY);
      // место под пальцем: по центру плитки
      const p = at(place, cellW, cellH);
      const col = Math.min(Math.max(Math.round((p.x + e.translationX) / (cellW + GAP)), 0), COLS - 1);
      const row = Math.max(Math.round((p.y + e.translationY) / cellH), 0);
      const next = Math.min(row * COLS + col, count - 1);
      if (next !== to.get()) {
        to.set(next);
        runOnJS(Haptics.selectionAsync)();
      }
    })
    .onFinalize(() => {
      const a = from.get();
      const b = to.get();
      lifted.set(withTiming(0, { duration: 160 }));
      if (a < 0 || b < 0 || a === b) {
        // отпустили на том же месте — плитка возвращается
        dx.set(withTiming(0, { duration: 160 }));
        dy.set(withTiming(0, { duration: 160 }));
        from.set(-1);
        to.set(-1);
        return;
      }
      // плитка доезжает до нового места, потом порядок меняется по-настоящему
      const pa = at(a, cellW, cellH);
      const pb = at(b, cellW, cellH);
      dx.set(withTiming(pb.x - pa.x, { duration: 140 }));
      dy.set(
        withTiming(pb.y - pa.y, { duration: 140 }, (fin) => {
          from.set(-1);
          to.set(-1);
          if (fin) runOnJS(onMove)(a, b);
        }),
      );
    });

  const style = useAnimatedStyle(() => {
    const a = from.get();
    const b = to.get();
    const me = a === place;
    // остальные расступаются: между «откуда» и «куда» сдвигаются на одно место
    let shown = place;
    if (a >= 0 && !me) {
      if (a < b && place > a && place <= b) shown = place - 1;
      else if (a > b && place >= b && place < a) shown = place + 1;
    }
    const p = at(me ? place : shown, cellW, cellH);
    return {
      zIndex: me ? 10 : 0,
      transform: [
        { translateX: me ? p.x + dx.get() : withTiming(p.x, { duration: 180 }) },
        { translateY: me ? p.y + dy.get() : withTiming(p.y, { duration: 180 }) },
        { scale: 1 + lifted.get() * 0.06 },
      ],
      shadowOpacity: lifted.get() * 0.25,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[s.cell, { width: cellW }, style]} accessibilityLabel={`${label}. Зажмите и перетащите`}>
        <View style={s.thumb}>{children}</View>
        <Text style={s.label} numberOfLines={1}>
          {label}
          {wide ? ' · разворот' : ''}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 44 },
  title: { fontSize: 18, fontFamily: fonts.display, color: colors.fg },
  headBtn: { fontSize: 16, fontFamily: fonts.semibold, color: colors.mut },
  headDone: { color: colors.coralLink },
  hint: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center', marginBottom: 12, paddingHorizontal: 20 },
  cell: { position: 'absolute', left: 0, top: 0, shadowColor: '#000', shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  thumb: { borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.card2 },
  label: { height: LABEL_H, lineHeight: LABEL_H, fontSize: 12, fontFamily: fonts.semibold, color: colors.mut, textAlign: 'center' },
});
