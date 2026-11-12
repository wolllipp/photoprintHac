/**
 * Кадр фото в рамке страницы — вручную: подвинуть пальцем, приблизить щипком (или «−» / «+»).
 * Кадр хранится как центр и увеличение (Crop), а не как прямоугольник: сменили макет — пропорции рамки другие,
 * а фото не растягивается и центр остаётся тем, что выбрал человек.
 * Тот же кадр уходит на сервер вместе с рамкой страницы (api/book.ts → savePage) и учитывается при проверке разрешения.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { MinusIcon, PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { pic, type Pic } from '@/data/photos';
import { colors, fonts } from '@/theme';

/** cx, cy — центр кадра в долях фото (0…1); z — увеличение (1 — фото целиком закрывает рамку); a — ширина/высота фото. */
export type Crop = { cx: number; cy: number; z: number; a: number };

export const MAX_ZOOM = 4;

/** Где и какого размера нарисовать фото, чтобы в рамке W×H был этот кадр (без искажений). */
export function cropRect(c: Crop, W: number, H: number) {
  'worklet';
  const fa = W / H;
  // доля фото, видимая без увеличения (как contentFit="cover")
  const w0 = c.a > fa ? fa / c.a : 1;
  const h0 = c.a > fa ? 1 : c.a / fa;
  const w = w0 / c.z;
  const h = h0 / c.z;
  const x = Math.min(Math.max(c.cx - w / 2, 0), 1 - w);
  const y = Math.min(Math.max(c.cy - h / 2, 0), 1 - h);
  const iw = W / w;
  const ih = H / h;
  return { left: -x * iw, top: -y * ih, width: iw, height: ih };
}

/** Центр не уходит за край фото: на краю кадр упирается, а не показывает пустоту. */
function clampCenter(cx: number, cy: number, z: number, a: number, fa: number) {
  'worklet';
  const w = (a > fa ? fa / a : 1) / z;
  const h = (a > fa ? 1 : a / fa) / z;
  return { cx: Math.min(Math.max(cx, w / 2), 1 - w / 2), cy: Math.min(Math.max(cy, h / 2), 1 - h / 2) };
}

/** Фото в рамке с ручным кадром — для страниц книги. Без кадра — как раньше, по центру. */
export function CroppedImage({ k, crop, w, h }: { k: Pic; crop: Crop; w: number; h: number }) {
  return <Image source={pic(k)} style={[{ position: 'absolute' }, cropRect(crop, w, h)]} contentFit="cover" transition={200} />;
}

/** Кадр по умолчанию: фото по центру, без увеличения (a уточняется, когда фото загрузится). */
export const centerCrop = (a: number): Crop => ({ cx: 0.5, cy: 0.5, z: 1, a });

/**
 * Окно кадрирования. aspect — ширина/высота рамки на странице. onDone(undefined) — кадр по умолчанию.
 */
export function CropEditor({ k, aspect, initial, onDone, onClose }: { k: Pic; aspect: number; initial?: Crop; onDone: (c: Crop | undefined) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // рамка — на всю ширину, но не выше половины экрана
  let W = width - 32;
  let H = W / aspect;
  const maxH = height * 0.5;
  if (H > maxH) {
    H = maxH;
    W = H * aspect;
  }
  const cx = useSharedValue(initial?.cx ?? 0.5);
  const cy = useSharedValue(initial?.cy ?? 0.5);
  const z = useSharedValue(initial?.z ?? 1);
  // пропорции фото: до загрузки — как у рамки (без искажения, просто без запаса для сдвига)
  const a = useSharedValue(initial?.a ?? aspect);
  const [ready, setReady] = useState(!!initial);
  const start = useSharedValue({ cx: 0.5, cy: 0.5, z: 1 });

  const pan = Gesture.Pan()
    .onStart(() => {
      start.set({ cx: cx.get(), cy: cy.get(), z: z.get() });
    })
    .onUpdate((e) => {
      // палец тянет фото: кадр сдвигается в обратную сторону, на долю видимой части
      const fa = W / H;
      const w = (a.get() > fa ? fa / a.get() : 1) / z.get();
      const h = (a.get() > fa ? 1 : a.get() / fa) / z.get();
      const next = clampCenter(start.get().cx - (e.translationX / W) * w, start.get().cy - (e.translationY / H) * h, z.get(), a.get(), fa);
      cx.set(next.cx);
      cy.set(next.cy);
    });
  const pinch = Gesture.Pinch()
    .onStart(() => {
      start.set({ cx: cx.get(), cy: cy.get(), z: z.get() });
    })
    .onUpdate((e) => {
      z.set(Math.min(Math.max(start.get().z * e.scale, 1), MAX_ZOOM));
      const next = clampCenter(cx.get(), cy.get(), z.get(), a.get(), W / H);
      cx.set(next.cx);
      cy.set(next.cy);
    });
  const gesture = Gesture.Simultaneous(pan, pinch);

  const img = useAnimatedStyle(() => cropRect({ cx: cx.get(), cy: cy.get(), z: z.get(), a: a.get() }, W, H));

  // «−» / «+» — для тех, кому неудобно щипком (и для доступности)
  const zoomBy = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    const nz = Math.min(Math.max(z.get() + d, 1), MAX_ZOOM);
    const next = clampCenter(cx.get(), cy.get(), nz, a.get(), W / H);
    z.set(withTiming(nz, { duration: 180 }));
    cx.set(withTiming(next.cx, { duration: 180 }));
    cy.set(withTiming(next.cy, { duration: 180 }));
  };
  const reset = () => {
    Haptics.selectionAsync().catch(() => {});
    z.set(withTiming(1, { duration: 200 }));
    cx.set(withTiming(0.5, { duration: 200 }));
    cy.set(withTiming(0.5, { duration: 200 }));
  };
  const done = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const c: Crop = { cx: r(cx.get()), cy: r(cy.get()), z: r(z.get()), a: r(a.get()) };
    // ничего не меняли — кадр по умолчанию, хранить нечего
    onDone(c.z <= 1.001 && Math.abs(c.cx - 0.5) < 0.002 && Math.abs(c.cy - 0.5) < 0.002 ? undefined : c);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={[s.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.head}>
          <Tap onPress={onClose} hitSlop={10} accessibilityRole="button">
            <Text style={s.headBtn}>Отмена</Text>
          </Tap>
          <Text style={s.title}>Кадр</Text>
          <Tap onPress={done} hitSlop={10} accessibilityRole="button">
            <Text style={[s.headBtn, s.headDone]}>Готово</Text>
          </Tap>
        </View>

        <View style={s.center}>
          <GestureDetector gesture={gesture}>
            <View style={[s.frame, { width: W, height: H }]} accessibilityLabel="Кадр фото: двигайте пальцем, разведите двумя пальцами, чтобы приблизить">
              <Animated.View style={[{ position: 'absolute' }, img]}>
                <Image
                  source={pic(k)}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  onLoad={(e) => {
                    // настоящие пропорции фото — теперь знаем, сколько запаса для сдвига
                    if (e.source.width && e.source.height) a.set(e.source.width / e.source.height);
                    setReady(true);
                  }}
                />
              </Animated.View>
              {/* сетка третей — помогает поставить горизонт и лица */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={[s.line, { left: W / 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                <View style={[s.line, { left: (2 * W) / 3, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                <View style={[s.line, { top: H / 3, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
                <View style={[s.line, { top: (2 * H) / 3, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
              </View>
            </View>
          </GestureDetector>
          {ready ? (
            <Animated.Text entering={FadeIn.duration(200)} style={s.hint}>
              Двигайте фото пальцем · разведите двумя пальцами, чтобы приблизить
            </Animated.Text>
          ) : null}
        </View>

        <View style={s.bar}>
          <Tap style={s.round} onPress={() => zoomBy(-0.25)} accessibilityRole="button" accessibilityLabel="Отдалить">
            <MinusIcon size={18} color="#fff" weight="bold" />
          </Tap>
          <Tap style={s.reset} onPress={reset} accessibilityRole="button">
            <Text style={s.resetText}>Как было</Text>
          </Tap>
          <Tap style={s.round} onPress={() => zoomBy(0.25)} accessibilityRole="button" accessibilityLabel="Приблизить">
            <PlusIcon size={18} color="#fff" weight="bold" />
          </Tap>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'rgba(14,12,11,0.96)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 44 },
  title: { fontSize: 18, fontFamily: fonts.display, color: '#fff' },
  headBtn: { fontSize: 16, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.75)' },
  headDone: { color: colors.coral },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  frame: { overflow: 'hidden', borderRadius: 4, backgroundColor: '#222', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
  line: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.45)' },
  hint: { fontSize: 13.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingHorizontal: 24 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  reset: { height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center' },
  resetText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
});
