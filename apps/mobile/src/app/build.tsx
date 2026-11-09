/**
 * Путь Б, шаг 2 — «Собираем книгу». Видно, что делает ИИ, а не крутится круг:
 * кадры по одному ложатся в стопку (отбор) → разлетаются по местам разворота (вёрстка) →
 * по развороту проходит проверка лиц и обреза → появляется подпись главы → галочка.
 * Этапы в продукте приходят из GET /jobs/{id} (build_jobs). Здесь — таймер (DEMO_MODE).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { type PhotoName, pic } from '@/data/photos';
import { duration, ease, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const STEPS = [
  { title: 'Кадры', now: 'смотрим 214 фото', done: '38 лучших' },
  { title: 'Главы', now: 'ищем пары и крупные планы', done: '4 главы' },
  { title: 'Лица и обрез', now: 'проверяем край страниц', done: 'всё в норме' },
  { title: 'Подписи', now: 'пишем названия глав', done: 'готово' },
];
const STEP_MS = 1500;

/** Места на развороте в долях ширины и высоты: [x, y, w, h]. Левая страница — крупный кадр и два малых. */
const SLOTS: [number, number, number, number][] = [
  [0.035, 0.07, 0.43, 0.56],
  [0.035, 0.67, 0.205, 0.26],
  [0.26, 0.67, 0.205, 0.26],
  [0.535, 0.07, 0.43, 0.42],
  [0.535, 0.53, 0.43, 0.4],
];
const SHOTS: PhotoName[] = ['city-sunset', 'friends-night', 'cafe-dessert', 'night-window', 'roses'];
/** Как лежат кадры в стопке до вёрстки: у каждого свой сдвиг и поворот — стопка выглядит живой. */
const PILE = [
  { dx: -8, dy: 4, r: -9 },
  { dx: 10, dy: -6, r: 7 },
  { dx: -2, dy: -10, r: -3 },
  { dx: 6, dy: 8, r: 11 },
  { dx: 0, dy: 0, r: -1 },
];

export default function Build() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState(0);
  const done = step >= STEPS.length;

  useEffect(() => {
    if (done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const t = setTimeout(() => router.replace('/select'), 1300);
      return () => clearTimeout(t);
    }
    if (step > 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const t = setTimeout(() => setStep((x) => x + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step, done]);

  const W = width - 36;
  const H = Math.round(W * 0.6);

  return (
    <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <NavBar title="" />
      <View style={s.body}>
        <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
          <Animated.Text key={done ? 'done' : 'work'} entering={FadeIn.duration(duration.slow)} style={s.title}>
            {done ? 'Книга готова' : 'Собираем книгу'}
          </Animated.Text>
          <Text style={s.sub}>{done ? 'Карелия, июль · 24 страницы · 38 фото' : 'Карелия, июль · обычно до 30 секунд'}</Text>
        </View>

        <Spread w={W} h={H} step={step} />

        {/* шаги — теми же строками «подпись — итог», что в диалоге */}
        <View style={{ gap: 6 }}>
          {STEPS.map((st, i) => {
            const isDone = i < step;
            const now = i === step;
            return (
              <View key={st.title} style={[s.row, !isDone && !now && { opacity: 0.45 }]}>
                <Text style={s.rowLabel}>{st.title}</Text>
                {isDone ? (
                  <Animated.Text entering={FadeIn.duration(duration.fast)} style={s.rowDone}>
                    {st.done}
                  </Animated.Text>
                ) : now ? (
                  <ThinkingLine text={`${st.now}…`} style={s.rowNow} />
                ) : (
                  <Text style={s.rowNow}>ждёт</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
      <Tap style={s.stop} onPress={() => router.back()} accessibilityRole="button">
        <Text style={s.stopText}>Остановить</Text>
      </Tap>
    </View>
  );
}

/** Разворот книги, на котором видно работу: стопка → вёрстка → проверка → подпись. */
function Spread({ w, h, step }: { w: number; h: number; step: number }) {
  return (
    <View style={[s.spread, { width: w, height: h }]} accessible accessibilityLabel="Разворот собирается">
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(60,40,30,0.12)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[s.spine, { left: w / 2 - 14 }]}
      />
      {SHOTS.map((k, i) => (
        <Shot key={k} k={k} i={i} w={w} h={h} laid={step >= 1} />
      ))}
      {step === 2 ? <Scan w={w} h={h} /> : null}
      {step >= 3 ? (
        <Animated.View entering={FadeInDown.duration(duration.slow).easing(ease.smoothOut)} style={s.caption}>
          <Text style={s.captionText}>Глава 1 · Дорога на север</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Shot({ k, i, w, h, laid }: { k: PhotoName; i: number; w: number; h: number; laid: boolean }) {
  const [x, y, sw, sh] = SLOTS[i];
  const p = PILE[i];
  // стопка — в центре разворота, кадры одного размера
  const pw = w * 0.34;
  const ph = h * 0.5;
  const from = { left: (w - pw) / 2 + p.dx, top: (h - ph) / 2 + p.dy, width: pw, height: ph, rot: p.r };
  const to = { left: x * w, top: y * h, width: sw * w, height: sh * h };

  const t = useSharedValue(0); // 0 — в стопке, 1 — на месте
  const shown = useSharedValue(0); // появление в стопке по одному
  useEffect(() => {
    shown.value = withDelay(i * 160, withTiming(1, { duration: duration.slow, easing: ease.smoothOut, reduceMotion: ReduceMotion.System }));
  }, [i, shown]);
  useEffect(() => {
    if (laid) t.value = withDelay(i * 90, withSpring(1, { damping: 18, stiffness: 160, reduceMotion: ReduceMotion.System }));
  }, [laid, i, t]);

  const a = useAnimatedStyle(() => {
    const m = (a0: number, b0: number) => a0 + (b0 - a0) * t.value;
    return {
      left: m(from.left, to.left),
      top: m(from.top, to.top) + (1 - shown.value) * 18,
      width: m(from.width, to.width),
      height: m(from.height, to.height),
      opacity: shown.value,
      borderRadius: m(10, 4),
      transform: [{ rotate: `${m(from.rot, 0)}deg` }, { scale: 0.92 + 0.08 * shown.value }],
    };
  });
  return (
    <Animated.View style={[s.shot, a]}>
      <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

/** Проверка лиц и обреза: светлая полоса проходит по развороту туда и обратно. */
function Scan({ w, h }: { w: number; h: number }) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: ease.inOut, reduceMotion: ReduceMotion.System }), -1, true);
  }, [x]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -40 + x.value * (w + 40) }] }));
  return (
    <Animated.View pointerEvents="none" entering={FadeIn.duration(duration.fast)} style={[s.scan, { height: h }, a]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16, gap: 18, paddingTop: 4 },
  spread: { backgroundColor: '#FFFDFB', borderRadius: 8, overflow: 'hidden', boxShadow: '0 10px 30px -14px rgba(60,40,30,0.35), 0 0 0 1px rgba(60,40,30,0.06)' },
  spine: { position: 'absolute', top: 0, bottom: 0, width: 28 },
  shot: { position: 'absolute', overflow: 'hidden', backgroundColor: colors.card2, boxShadow: '0 4px 10px -4px rgba(0,0,0,0.25)' },
  scan: { position: 'absolute', top: 0, left: 0, width: 40 },
  caption: { position: 'absolute', right: 10, bottom: 4 },
  captionText: { fontSize: 10, fontFamily: fonts.semibold, color: colors.mut, letterSpacing: 0.2 },
  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  sub: { fontSize: 15, fontFamily: fonts.regular, color: colors.mut },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.card, borderRadius: 18, height: 50, paddingHorizontal: 16 },
  rowLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  rowDone: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  rowNow: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  stop: { height: 54, borderRadius: 27, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  stopText: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
});
