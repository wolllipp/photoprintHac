/**
 * «Собираем книгу» — просто и спокойно: ваши фотокарточки плавно кружатся по эллипсу с глубиной, без наплывов,
 * под ними одна строка — что сейчас делает ИИ — и тонкая полоса. Потом — сразу просмотр книги.
 * Этапы в продукте приходят из GET /jobs/{id} (build_jobs). Здесь — таймер (DEMO_MODE).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { buildOnServer, takePendingBook } from '@/api/book';
import { TitleBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { type PhotoName, pic } from '@/data/photos';
import { duration, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const STEPS = [
  { now: 'Смотрим ваши фото' },
  { now: 'Ищем дубли и смазанные' },
  { now: 'Оставляем лучшие' },
  { now: 'Раскладываем по страницам' },
];
const STEP_MS = 1600;

const CARDS: PhotoName[] = ['city-sunset', 'cafe-dessert', 'roses', 'night-window', 'bouquet', 'cafe-interior'];
const ORBIT_MS = 10000;

/**
 * Карточки кружатся по эллипсу с глубиной: ближние крупнее и ярче, дальние меньше и бледнее.
 * Без наплывов: карточек шесть и они разнесены так, что две карточки меняются местами «кто впереди»
 * (это происходит, когда они на одной глубине — симметрично слева и справа) только когда уже не касаются.
 */
function Orbit({ w, h }: { w: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withTiming(1, { duration: ORBIT_MS, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1, false));
  }, [t]);
  const card = Math.min(w * 0.26, h * 0.3);
  return (
    <View style={{ width: w, height: h }} accessible accessibilityLabel="Собираем книгу из ваших фото">
      {CARDS.map((k, i) => (
        <OrbitCard key={k} k={k} i={i} n={CARDS.length} t={t} w={w} h={h} card={card} />
      ))}
    </View>
  );
}

function OrbitCard({ k, i, n, t, w, h, card }: { k: PhotoName; i: number; n: number; t: SharedValue<number>; w: number; h: number; card: number }) {
  const ch = card * 1.24;
  const rx = w / 2 - card * 0.6;
  const ry = h * 0.24;
  const style = useAnimatedStyle(() => {
    const a = (i / n + t.value) * Math.PI * 2;
    const depth = (Math.sin(a) + 1) / 2; // 0 — дальняя, 1 — ближняя
    return {
      left: w / 2 + Math.cos(a) * rx - card / 2,
      top: h / 2 + Math.sin(a) * ry - ch / 2,
      zIndex: Math.round(depth * 100),
      opacity: 0.5 + depth * 0.5,
      transform: [{ scale: 0.66 + depth * 0.42 }, { rotate: `${Math.cos(a) * 8}deg` }],
    };
  });
  return (
    <Animated.View style={[s.card, { width: card, height: ch }, style]}>
      <Image source={pic(k)} style={s.cardPhoto} contentFit="cover" />
    </Animated.View>
  );
}

export default function Build() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<Record<string, string>>();
  const [step, setStep] = useState(0);
  const [stageH, setStageH] = useState(0);
  const done = step >= STEPS.length;
  const title = params.title ?? 'Карелия, июль';

  // если фото выбраны в галерее — собираем на сервере: этапы приходят оттуда. Сервер недоступен — доигрываем демо.
  const [pending] = useState(() => takePendingBook());
  const [server, setServer] = useState<'off' | 'running' | 'done'>(pending ? 'running' : 'off');
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    if (!pending) return;
    buildOnServer(pending, (n) => setStep((x) => Math.max(x, Math.min(n, STEPS.length - 1))))
      .then((book) => {
        setProjectId(book.projectId);
        setServer('done');
        setStep(STEPS.length);
      })
      .catch(() => setServer('off'));
  }, [pending]);

  useEffect(() => {
    if (done) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // книга собрана — сразу листаем её (параметры из диалога передаём дальше; с сервера — ещё и id проекта)
      const t = setTimeout(() => router.replace({ pathname: '/review', params: projectId ? { ...params, id: projectId, projectId } : params }), 1200);
      return () => clearTimeout(t);
    }
    if (step > 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // пока собирает сервер — шаги двигает он, а не таймер
    if (server === 'running') return;
    const t = setTimeout(() => setStep((x) => x + 1), STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, done, server]);

  const W = width - 32;

  return (
    <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <TitleBar
        title={
          <Animated.Text key={done ? 'done' : 'work'} entering={FadeIn.duration(duration.slow)} style={s.title} numberOfLines={1} accessibilityRole="header">
            {done ? 'Книга готова' : 'Собираем книгу'}
          </Animated.Text>
        }
      />
      <View style={s.body}>
        <Text style={s.sub} accessibilityLiveRegion="polite">{title} · обычно до 30 секунд</Text>

        {/* карточки и строка этапа — одним компактным блоком по центру оставшегося места:
            анимация не растягивается на весь экран и не оставляет пустоту сверху */}
        <View style={s.stage} onLayout={(e) => setStageH(e.nativeEvent.layout.height)}>
          {stageH ? <Orbit w={W} h={Math.min(stageH - 110, W * 0.72)} /> : null}

        {/* этап — одной строкой и тонкой полосой, без отдельных плиток */}
        <View style={s.status} accessibilityLiveRegion="polite">
          <View style={s.statusRow}>
            {done ? (
              <Animated.Text key="done" entering={FadeIn.duration(duration.fast)} style={s.statusText}>
                Готово · 24 страницы
              </Animated.Text>
            ) : (
              <ThinkingLine key={step} text={STEPS[step].now} style={s.statusText} />
            )}
            <Text style={s.statusStep}>{Math.min(step + 1, STEPS.length)} из {STEPS.length}</Text>
          </View>
          <View style={s.track}>
            <Animated.View layout={LinearTransition.duration(STEP_MS * 0.8)} style={[s.trackFill, { width: `${(Math.min(step + 1, STEPS.length) / STEPS.length) * 100}%` }]} />
          </View>
        </View>
        </View>
      </View>
      <Tap style={s.stop} onPress={() => router.back()} accessibilityRole="button">
        <Text style={s.stopText}>Остановить</Text>
      </Tap>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 16, gap: 8, paddingTop: 0, paddingBottom: 16 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  sub: { fontSize: 15, fontFamily: fonts.regular, color: colors.mut },
  stage: { flex: 1, justifyContent: 'center', gap: 28, overflow: 'hidden' },
  card: { position: 'absolute', backgroundColor: '#fff', borderRadius: 10, padding: 5, paddingBottom: 16, boxShadow: '0 8px 20px rgba(60,40,30,0.2)' },
  cardPhoto: { flex: 1, borderRadius: 5 },
  status: { gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  statusText: { flexShrink: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  statusStep: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.card, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: colors.coralAction },
  stop: { height: 54, borderRadius: 27, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  stopText: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
});
