/**
 * Удаление свайпом влево — как было в корзине (как в Telegram): плитка едет за пальцем, красная подложка
 * растёт следом. Короткий свайп оставляет кнопку «Удалить», дотянул дальше середины экрана — щелчок
 * вибрацией и удаление. Плитка возвращается на место и темнеет целиком: по центру «Удалено», нажатие на плитку
 * возвращает, отсчёт 5 секунд; по истечении строка схлопывается по высоте, соседи подтягиваются.
 */
import * as Haptics from 'expo-haptics';
import { ArrowCounterClockwiseIcon, TrashIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Pic } from '@/data/photos';
import { ease } from '@/motion';
import { fonts } from '@/theme';

/** Секунд на «Вернуть». */
const WAIT = 5;
/** Пружина свайпа: едва заметный отскок, без «желе». */
const SPRING = { damping: 30, stiffness: 260, mass: 1 };
const RADIUS = 26;

export function SwipeDelete({
  title,
  cover,
  what = 'Удалено',
  deleted,
  onDelete,
  onRestore,
  onExpire,
  gap = 12,
  children,
}: {
  title: string;
  cover: Pic;
  /** что написать на серой плитке: «Удалено из черновиков» */
  what?: string;
  deleted: boolean;
  onDelete: () => void;
  onRestore: () => void;
  /** время на отмену вышло — убрать по-настоящему */
  onExpire: () => void;
  /** отступ под плиткой (схлопывается вместе с ней) */
  gap?: number;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const OPEN = -96;
  // удаление: палец проходит чуть больше половины экрана
  const PULL = -width * 0.55;
  const FULL = OPEN + (PULL - OPEN) * 0.8;
  const drag = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const h = useSharedValue(0);
  const shrink = useSharedValue(1);
  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const warn = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

  const commit = () => {
    'worklet';
    x.value = withTiming(0, { duration: 260, easing: ease.smoothOut });
    scheduleOnRN(warn);
    scheduleOnRN(onDelete);
  };
  const pan = usePanGesture({
    enabled: !deleted,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onBegin: () => {
      'worklet';
      start.value = x.value;
    },
    onUpdate: (e) => {
      'worklet';
      // только влево: вправо плитка не едет
      const next = Math.min(0, start.value + e.translationX);
      drag.value = next;
      x.value = next > OPEN ? next : OPEN + (next - OPEN) * 0.8;
      const a = next < PULL;
      if (a !== armed.value) {
        armed.value = a;
        scheduleOnRN(tick);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      let to = x.value < OPEN / 2 ? OPEN : 0;
      if (e.velocityX < -250) to = OPEN;
      if (e.velocityX > 250) to = 0;
      if (drag.value < PULL) commit();
      else x.value = withSpring(to, { ...SPRING, velocity: Math.max(-1500, Math.min(1500, e.velocityX)) });
      armed.value = false;
    },
  });

  // 5 секунд на «Вернуть», потом схлопываемся; обработчик — из ссылки, чтобы перерисовки не сбрасывали таймер
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  });
  useEffect(() => {
    if (!deleted) return;
    const expire = () => expireRef.current();
    const t = setTimeout(() => {
      shrink.value = withTiming(0, { duration: 260, easing: ease.smoothOut }, (d) => {
        if (d) scheduleOnRN(expire);
      });
    }, WAIT * 1000);
    return () => clearTimeout(t);
  }, [deleted, shrink]);

  const tile = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const back = useAnimatedStyle(() => ({ width: Math.max(0, -x.value - 8), opacity: x.value < -4 ? 1 : 0 }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(x.value < FULL ? 1.1 : 1, { duration: 150 }) }] }));
  const row = useAnimatedStyle(() => (shrink.value < 1 ? { height: h.value * shrink.value, opacity: shrink.value, overflow: 'hidden' } : {}));

  return (
    <Animated.View
      style={[{ paddingBottom: gap }, row]}
      onLayout={(e) => {
        if (shrink.value === 1) h.value = e.nativeEvent.layout.height;
      }}>
      <Animated.View style={[s.delete, { bottom: gap }, back]}>
        <Pressable style={s.deleteHit} onPress={commit} accessibilityRole="button" accessibilityLabel={`Удалить «${title}»`}>
          <Animated.View style={[{ alignItems: 'center', gap: 4 }, icon]}>
            <TrashIcon size={22} color="#fff" weight="fill" />
            <Text style={s.deleteText} numberOfLines={1}>Удалить</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={tile}>
          {children}
          {deleted ? (
            <Animated.View entering={FadeIn.delay(80).duration(380).easing(Easing.out(Easing.quad))} exiting={FadeOut.duration(220)} style={[StyleSheet.absoluteFill, s.ghost]} accessibilityLiveRegion="polite">
              <Pending title={title} what={what} onRestore={onRestore} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * «Удалено»: вся плитка темнеет, по центру — что удалили и сколько секунд на отмену,
 * внизу тает полоска. Вернуть — нажать на плитку целиком, без отдельной кнопки.
 */
function Pending({ title, what, onRestore }: { title: string; what: string; onRestore: () => void }) {
  const [left, setLeft] = useState(WAIT);
  const p = useSharedValue(1);
  useEffect(() => {
    p.value = withTiming(0, { duration: WAIT * 1000, easing: Easing.linear });
    const t = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1000);
    return () => clearInterval(t);
  }, [p]);
  const bar = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <Pressable
      style={s.veil}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onRestore();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${what}: «${title}». Нажмите, чтобы вернуть. Осталось ${left} секунд`}>
      {/* размываем и затемняем всё под собой: текст и фото плитки не просвечивают и не спорят с надписью */}
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.veilShade]} />
      <ArrowCounterClockwiseIcon size={26} color="#fff" weight="bold" />
      <Text style={s.veilTitle}>{what}</Text>
      <Text style={s.veilSub}>Нажмите, чтобы вернуть · {left} с</Text>
      <View style={s.ghostTrack} pointerEvents="none">
        <Animated.View style={[s.ghostBar, bar]} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  delete: { position: 'absolute', right: 0, top: 0, borderRadius: RADIUS, backgroundColor: '#D9483B', overflow: 'hidden' },
  deleteHit: { flex: 1, minWidth: 88, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  ghost: { borderRadius: RADIUS, overflow: 'hidden' },
  veil: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 },
  veilShade: { backgroundColor: 'rgba(20,16,14,0.62)' },
  veilTitle: { fontSize: 21, fontFamily: fonts.display, letterSpacing: -0.3, color: '#fff', textAlign: 'center' },
  veilSub: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff', textAlign: 'center', fontVariant: ['tabular-nums'] },
  ghostTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  ghostBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
});
