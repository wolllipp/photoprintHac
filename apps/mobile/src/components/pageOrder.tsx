/**
 * «Порядок страниц» — сетка уменьшенных страниц: зажать страницу и перетащить на новое место, остальные расступаются.
 * Разворот на две страницы двигается целиком (одна плитка). Открывается долгим нажатием на страницу в книге.
 * Порядок применяется по «Готово»; «Отмена» — всё как было.
 *
 * Где какая плитка стоит — живёт в анимации (positions на UI-потоке), а не в состоянии React: при отпускании ничего
 * не перерисовывается, плитка просто доезжает до своего места. Раньше порядок менялся в React, и плитки на миг
 * возвращались на старые места — получался «удар».
 */
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
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
/** Плитки расступаются мягко, без отскока. */
const SLIDE = { duration: 200 };

export function PageOrder({ items, aspect, onDone, onClose }: { items: OrderItem[]; aspect: number; onDone: (order: number[]) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cellW = (width - 32 - GAP * (COLS - 1)) / COLS;
  const thumbH = cellW / aspect;
  const cellH = thumbH + LABEL_H + GAP;
  // positions[i] — на каком месте сейчас плитка i (i — индекс в items)
  const positions = useSharedValue(items.map((_, i) => i));
  const [moved, setMoved] = useState(false);
  const rows = Math.ceil(items.length / COLS);

  const done = () => {
    // место → какая плитка там стоит
    const pos = positions.get();
    const order = items.map((_, i) => i).sort((a, b) => pos[a] - pos[b]);
    onDone(order);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={[s.screen, { paddingTop: insets.top + 10 }]}>
        <View style={s.head}>
          <Tap onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={s.headBtn}>Отмена</Text>
          </Tap>
          <Text style={s.title}>Порядок страниц</Text>
          <Tap onPress={done} hitSlop={10} accessibilityRole="button" accessibilityState={{ disabled: !moved }}>
            <Text style={[s.headBtn, s.headDone, !moved && { opacity: 0.4 }]}>Готово</Text>
          </Tap>
        </View>
        <Text style={s.hint}>Зажмите страницу и перетащите на новое место</Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={{ height: rows * cellH }}>
            {items.map((it, i) => (
              <Cell key={it.key} index={i} positions={positions} cellW={cellW} cellH={cellH} onMoved={() => setMoved(true)} label={it.label} wide={it.wide}>
                {it.render(cellW, thumbH)}
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

/** Плитку index переставили на место to: остальные сдвигаются на одно место (как при вставке в список). */
function moveTo(pos: number[], index: number, to: number) {
  'worklet';
  const from = pos[index];
  if (from === to) return pos;
  return pos.map((p, i) => {
    if (i === index) return to;
    if (from < to && p > from && p <= to) return p - 1;
    if (from > to && p >= to && p < from) return p + 1;
    return p;
  });
}

function Cell({ index, positions, cellW, cellH, onMoved, label, wide, children }: { index: number; positions: SharedValue<number[]>; cellW: number; cellH: number; onMoved: () => void; label: string; wide?: boolean; children: ReactNode }) {
  const dragging = useSharedValue(false);
  const lifted = useSharedValue(0);
  // где плитка под пальцем (абсолютно в сетке) и откуда начали тащить
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ x: 0, y: 0 });

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      const p = at(positions.get()[index], cellW, cellH);
      start.set(p);
      x.set(p.x);
      y.set(p.y);
      dragging.set(true);
      lifted.set(withSpring(1, { damping: 20, stiffness: 260 }));
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      const nx = start.get().x + e.translationX;
      const ny = start.get().y + e.translationY;
      x.set(nx);
      y.set(ny);
      // место под центром плитки
      const n = positions.get().length;
      const col = Math.min(Math.max(Math.round(nx / (cellW + GAP)), 0), COLS - 1);
      const row = Math.max(Math.round(ny / cellH), 0);
      const target = Math.min(row * COLS + col, n - 1);
      if (target !== positions.get()[index]) {
        positions.set(moveTo(positions.get(), index, target));
        runOnJS(Haptics.selectionAsync)();
        runOnJS(onMoved)();
      }
    })
    .onFinalize(() => {
      if (!dragging.get()) return;
      // плитка доезжает до своего места — то же место, что считают остальные, поэтому без толчка
      const p = at(positions.get()[index], cellW, cellH);
      x.set(withTiming(p.x, SLIDE));
      y.set(
        withTiming(p.y, SLIDE, () => {
          dragging.set(false);
        }),
      );
      lifted.set(withTiming(0, SLIDE));
    });

  const style = useAnimatedStyle(() => {
    const p = at(positions.get()[index], cellW, cellH);
    const me = dragging.get();
    return {
      zIndex: me ? 10 : 0,
      transform: [
        { translateX: me ? x.get() : withTiming(p.x, SLIDE) },
        { translateY: me ? y.get() : withTiming(p.y, SLIDE) },
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
