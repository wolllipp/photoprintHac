/**
 * Размер фото на странице — вручную: на границах между фото ручки, тянешь — одно фото больше, соседнее меньше.
 * Работает на любом макете (два рядом, крупное и два, «полтора листа» через корешок). Фото не меньше 15% стороны.
 * Результат — свои прямоугольники страницы (Rect в долях); уходят на сервер рамками страницы (api/book.ts → savePage).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CroppedImage, type Crop } from '@/components/cropEditor';
import { Tap } from '@/components/ui';
import { edgesOf, moveEdge, type Edge, type LayoutDef, type Rect } from '@/data/layouts';
import { pic, type Pic } from '@/data/photos';
import { colors, fonts } from '@/theme';

/** Место фото в пикселях — те же поля и зазоры, что на странице книги (review.tsx, slotBox). */
function box(r: Rect, w: number, h: number, bleed?: boolean) {
  const pad = bleed ? 0 : 12;
  const gap = bleed ? 0 : 8;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return { left: pad + r.x * iw + (r.x > 0 ? gap / 2 : 0), top: pad + r.y * ih + (r.y > 0 ? gap / 2 : 0), width: r.w * iw - (r.x > 0 ? gap / 2 : 0) - (r.x + r.w < 1 ? gap / 2 : 0), height: r.h * ih - (r.y > 0 ? gap / 2 : 0) - (r.y + r.h < 1 ? gap / 2 : 0) };
}

export function SizeEditor({ def, slots: initial, photos, crop, aspect, seam, onDone, onClose }: { def: LayoutDef; slots?: Rect[]; photos: Pic[]; crop?: Record<string, Crop>; aspect: number; seam?: boolean; onDone: (slots: Rect[] | undefined) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = W / aspect;
  const [slots, setSlots] = useState<Rect[]>(initial ?? def.slots);
  const pad = def.bleed ? 0 : 12;
  const iw = W - pad * 2;
  const ih = H - pad * 2;
  const edges = edgesOf(slots);

  const save = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const same = slots.every((r, i) => {
      const d = def.slots[i];
      return d && Math.abs(r.x - d.x) < 0.002 && Math.abs(r.y - d.y) < 0.002 && Math.abs(r.w - d.w) < 0.002 && Math.abs(r.h - d.h) < 0.002;
    });
    // вернули как в макете — хранить нечего
    onDone(same ? undefined : slots.map((r) => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) })));
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={[s.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.head}>
          <Tap onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={s.headBtn}>Отмена</Text>
          </Tap>
          <Text style={s.title}>Размер фото</Text>
          <Tap onPress={save} hitSlop={10} accessibilityRole="button">
            <Text style={[s.headBtn, s.headDone]}>Готово</Text>
          </Tap>
        </View>
        <View style={s.center}>
          <View style={[s.page, { width: W, height: H }]}>
            {slots.map((r, i) => {
              const b = box(r, W, H, def.bleed);
              const k = photos[i];
              const c = k ? crop?.[String(k)] : undefined;
              return (
                <View key={i} style={[s.slot, b, def.bleed && { borderRadius: 0 }]}>
                  {k && c ? <CroppedImage k={k} crop={c} w={b.width} h={b.height} /> : k ? <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                </View>
              );
            })}
            {seam ? <View pointerEvents="none" style={[s.seam, { left: W / 2 - 1 }]} /> : null}
            {/* ключ — по порядку, а не по положению: иначе ручка пересоздавалась посреди движения и «отпускалась» */}
            {edges.map((e, i) => (
              <Handle key={`${e.axis}-${i}`} edge={e} pad={pad} iw={iw} ih={ih} onMove={(to) => setSlots((cur) => moveEdge(cur, edgeNow(cur, e), to))} />
            ))}
          </View>
          <Text style={s.hint}>Тяните ручку между фото — одно станет больше, соседнее меньше</Text>
        </View>
        <View style={s.bar}>
          <Tap style={s.reset} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSlots(def.slots); }} accessibilityRole="button">
            <Text style={s.resetText}>Как в макете</Text>
          </Tap>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Та же граница в текущих размерах (после сдвига её значение at поменялось). */
function edgeNow(slots: Rect[], e: Edge): Edge {
  const all = edgesOf(slots).filter((x) => x.axis === e.axis);
  return all.reduce((best, x) => (Math.abs(x.at - e.at) < Math.abs(best.at - e.at) ? x : best), all[0] ?? e);
}

/** Ручка на границе: полоса вдоль неё и кружок посередине; тянуть — поперёк границы. */
function Handle({ edge, pad, iw, ih, onMove }: { edge: Edge; pad: number; iw: number; ih: number; onMove: (to: number) => void }) {
  // откуда начали тянуть — не состояние React: первый кадр движения иначе видел старое значение и граница прыгала
  const start = useSharedValue(edge.at);
  const [active, setActive] = useState(false);
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(2)
    .onStart(() => {
      start.set(edge.at);
      setActive(true);
      Haptics.selectionAsync().catch(() => {});
    })
    .onUpdate((e) => {
      const d = edge.axis === 'x' ? e.translationX / iw : e.translationY / ih;
      onMove(start.get() + d);
    })
    .onFinalize(() => setActive(false));
  const vertical = edge.axis === 'x';
  // зона касания шире самой ручки — попасть пальцем легко
  const style = vertical
    ? { left: pad + edge.at * iw - 22, top: pad + edge.from * ih, width: 44, height: (edge.to - edge.from) * ih }
    : { top: pad + edge.at * ih - 22, left: pad + edge.from * iw, height: 44, width: (edge.to - edge.from) * iw };
  return (
    <GestureDetector gesture={pan}>
      <View style={[s.handleZone, style]} accessibilityRole="adjustable" accessibilityLabel={vertical ? 'Граница между фото по горизонтали' : 'Граница между фото по вертикали'}>
        <View style={[vertical ? s.lineV : s.lineH, active && s.lineOn]} />
        <View style={[s.knob, active && s.knobOn]}>
          <View style={[vertical ? s.gripV : s.gripH]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'rgba(14,12,11,0.96)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 44 },
  title: { fontSize: 18, fontFamily: fonts.display, color: '#fff' },
  headBtn: { fontSize: 16, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.75)' },
  headDone: { color: colors.coral },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  page: { backgroundColor: '#fff', borderRadius: 4, overflow: 'hidden' },
  slot: { position: 'absolute', borderRadius: 4, overflow: 'hidden', backgroundColor: colors.card2 },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(0,0,0,0.12)' },
  handleZone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  lineV: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  lineH: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  lineOn: { backgroundColor: colors.coral },
  knob: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  knobOn: { backgroundColor: colors.coral },
  gripV: { width: 8, height: 12, borderLeftWidth: 2, borderRightWidth: 2, borderColor: colors.mut },
  gripH: { width: 12, height: 8, borderTopWidth: 2, borderBottomWidth: 2, borderColor: colors.mut },
  hint: { fontSize: 13.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingHorizontal: 24 },
  bar: { alignItems: 'center' },
  reset: { height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center' },
  resetText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
});
