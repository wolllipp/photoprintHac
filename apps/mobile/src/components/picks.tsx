/**
 * Идея книги на весь экран — как истории: сначала обложка с названием, потом несколько фото,
 * которые примерно войдут в книгу (карточками), затем — следующая идея.
 *  • касание справа — следующее фото альбома, слева — назад;
 *  • свайп вбок — соседний альбом (справа налево — следующий, слева направо — предыдущий), как в Instagram;
 *  • удержание — пауза: полоска замирает и продолжает с того же места, подписи прячутся, чтобы рассмотреть фото;
 *  • свайп вниз — закрыть (экран едет за пальцем и уменьшается).
 * Внизу всегда «Собрать эту книгу».
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { CaretRightIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, useLongPressGesture, usePanGesture, useTapGesture, useSimultaneousGestures, useExclusiveGestures } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, Extrapolation, FadeIn, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Glass } from '@/components/glass';
import { OverlapTitle } from '@/components/home';
import { Tap } from '@/components/ui';
import type { Suggestion } from '@/data/demo';
import { pic, type Pic } from '@/data/photos';
import { colors, fonts } from '@/theme';

const FRAME_MS = 4500;

export function PicksViewer({
  items,
  start,
  onClose,
  onSeen,
  onOpenBook,
}: {
  items: Suggestion[];
  /** с какой идеи открыть; null — закрыто */
  start: number | null;
  onClose: () => void;
  onSeen: (id: string) => void;
  onOpenBook: (id: string) => void;
}) {
  return (
    <Modal visible={start !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {start !== null ? <Viewer key={start} items={items} start={start} onClose={onClose} onSeen={onSeen} onOpenBook={onOpenBook} /> : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Кадры одной идеи: обложка, потом фото из будущей книги. */
const framesOf = (it: Suggestion): ('cover' | Pic)[] => ['cover', ...(it.pages ?? []).slice(0, 4)];

function Viewer({ items, start, onClose, onSeen, onOpenBook }: { items: Suggestion[]; start: number; onClose: () => void; onSeen: (id: string) => void; onOpenBook: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(start);
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  // подписи и кнопки спрятаны — только пока держат палец (удержание), а не на любой паузе
  const [hidden, setHidden] = useState(false);
  // пришли свайпом — обложка и название уже видны (ехали вместе с лентой), второй раз их не проявляем
  const [swiped, setSwiped] = useState(false);
  const item = items[page];
  const frames = framesOf(item);

  // полоска текущего кадра: на паузе замирает и потом продолжает с того же места
  const progress = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // закрыть — экран плавно уезжает вниз, как при свайпе (раньше на последнем кадре он просто резко исчезал)
  const drag = useSharedValue(0);
  const closing = useRef(false);
  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    if (timer.current) clearTimeout(timer.current);
    cancelAnimation(progress);
    drag.set(
      withTiming(height, { duration: 320, easing: Easing.in(Easing.quad) }, (fin) => {
        if (fin) scheduleOnRN(onClose);
      }),
    );
  };
  const next = () => {
    setSwiped(false);
    if (frame < frames.length - 1) return setFrame((f) => f + 1);
    if (page + 1 >= items.length) return dismiss();
    setPage((p) => p + 1);
    setFrame(0);
  };
  const prev = () => {
    setSwiped(false);
    if (frame > 0) return setFrame((f) => f - 1);
    if (page > 0) {
      setPage((p) => p - 1);
      setFrame(0);
    }
  };
  useEffect(() => {
    onSeen(items[page].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  // сколько осталось кадру — считаем по часам, а не по полоске: значение полоски на JS-стороне отстаёт,
  // и сразу после смены кадра читалось «почти 1» → таймер срабатывал мгновенно и история пролистывалась вся сама
  const leftMs = useRef(FRAME_MS);
  const startedAt = useRef(0);
  const shown = useRef('');
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const key = `${page}-${frame}`;
    if (key !== shown.current) {
      // новый кадр — полоска и время с нуля
      shown.current = key;
      leftMs.current = FRAME_MS;
      startedAt.current = 0;
      progress.set(0);
    }
    if (paused) {
      if (startedAt.current) leftMs.current = Math.max(0, leftMs.current - (Date.now() - startedAt.current));
      startedAt.current = 0;
      cancelAnimation(progress);
      return;
    }
    startedAt.current = Date.now();
    progress.set(withTiming(1, { duration: leftMs.current, easing: Easing.linear }));
    timer.current = setTimeout(next, leftMs.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, frame, paused]);

  // свайп вниз — закрыть: экран едет за пальцем и чуть уменьшается
  const pan = usePanGesture({
    activeOffsetY: 12,
    failOffsetX: [-20, 20],
    // пауза — только когда свайп действительно начался (а не на любое касание)
    onActivate: () => {
      'worklet';
      scheduleOnRN(setPaused, true);
    },
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (drag.value > 140 || e.velocityY > 900) {
        drag.set(withTiming(height, { duration: 220, easing: Easing.in(Easing.quad) }, (fin) => {
          if (fin) scheduleOnRN(onClose);
        }));
      } else {
        drag.set(withTiming(0, { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
        scheduleOnRN(setPaused, false);
      }
    },
  });
  // свайп вбок — соседний альбом, как в Instagram: справа налево — следующий, слева направо — предыдущий.
  // Экран едет за пальцем; не дотянули — возвращается. На последнем альбоме свайп дальше закрывает истории.
  // Соседние альбомы уже лежат за краями экрана (prev — слева, next — справа): тянешь всю ленту, сосед виден сразу.
  // Доехала — меняем альбом и в тот же кадр возвращаем ленту в ноль: на месте уже нужный альбом, без дубля и рывка.
  const sx = useSharedValue(0);
  const toAlbum = (dir: 1 | -1) => {
    Haptics.selectionAsync().catch(() => {});
    setSwiped(true);
    setPage((p) => p + dir);
    setFrame(0);
    setPaused(false);
  };
  useLayoutEffect(() => {
    sx.set(0);
  }, [page, sx]);
  const swipe = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-18, 18],
    onActivate: () => {
      'worklet';
      scheduleOnRN(setPaused, true);
    },
    onUpdate: (e) => {
      'worklet';
      // у первого альбома назад не листается — только лёгкое сопротивление
      const atStart = page === 0 && e.translationX > 0;
      sx.set(atStart ? e.translationX * 0.25 : e.translationX);
    },
    onDeactivate: (e) => {
      'worklet';
      const dir = e.translationX < -width * 0.25 || e.velocityX < -700 ? 1 : e.translationX > width * 0.25 || e.velocityX > 700 ? -1 : 0;
      // последний альбом и листают дальше — истории закрываются (как в Instagram)
      if (dir === 1 && page + 1 >= items.length) {
        sx.set(withTiming(0, { duration: 160 }));
        scheduleOnRN(dismiss);
        return;
      }
      const can = dir === 1 || (dir === -1 && page > 0);
      if (!can) {
        sx.set(withTiming(0, { duration: 240, easing: Easing.bezier(0.32, 0.72, 0, 1) }));
        scheduleOnRN(setPaused, false);
        return;
      }
      // лента доезжает до соседа (он уже на экране), потом альбом меняется — без второго въезда
      sx.set(
        withTiming(-dir * width, { duration: 240, easing: Easing.out(Easing.cubic) }, (fin) => {
          if (fin) scheduleOnRN(toAlbum, dir as 1 | -1);
        }),
      );
    },
  });
  // удержание — пауза; отпустил — дальше
  const hold = useLongPressGesture({
    minDuration: 180,
    onActivate: () => {
      'worklet';
      scheduleOnRN(setPaused, true);
      scheduleOnRN(setHidden, true);
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(setPaused, false);
      scheduleOnRN(setHidden, false);
    },
  });
  // касание: левая треть — назад, остальное — дальше
  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.x < width / 3) scheduleOnRN(prev);
      else scheduleOnRN(next);
    },
  });
  const gestures = useSimultaneousGestures(pan, swipe, useExclusiveGestures(hold, tap));

  // экран сначала просто едет за пальцем; уменьшаться и скругляться начинает чуть позже и плавно
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: drag.value }, { scale: interpolate(drag.value, [0, 60, 400], [1, 1, 0.92], Extrapolation.CLAMP) }],
    borderRadius: interpolate(drag.value, [0, 60, 200], [0, 0, 24], Extrapolation.CLAMP),
  }));
  const row = useAnimatedStyle(() => ({ transform: [{ translateX: sx.value }] }));
  const prevItem = page > 0 ? items[page - 1] : null;
  const nextItem = page + 1 < items.length ? items[page + 1] : null;
  const bg = useAnimatedStyle(() => ({ opacity: interpolate(drag.value, [0, 400], [1, 0.35], Extrapolation.CLAMP) }));
  // при удержании подписи и кнопки мягко растворяются (и так же мягко возвращаются) — видно только фото.
  // Свайп (вбок или вниз) только ставит паузу и ничего не прячет: у соседа подписи видны, и раньше после
  // перехода всё мигало — исчезало и появлялось заново.
  const chrome = useAnimatedStyle(() => ({ opacity: withTiming(hidden ? 0 : 1, { duration: hidden ? 420 : 320, easing: Easing.bezier(0.33, 0, 0.2, 1) }) }));
  const titleSize = Math.max(34, Math.min(48, Math.round(width * 0.112)));
  const f = frames[frame];

  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, bg]} />
      <GestureDetector gesture={gestures}>
        <Animated.View style={[s.screen, sheet]}>
          <StatusBar style="light" />
          <Animated.View style={[StyleSheet.absoluteFill, row]}>
          {prevItem ? <AlbumPeek item={prevItem} left={-width} /> : null}
          {nextItem ? <AlbumPeek item={nextItem} left={width} /> : null}
          <View style={StyleSheet.absoluteFill}>
          {/* подложка — обложка альбома, без пересоздания: пока новый кадр рисуется, под ним не чёрный экран */}
          <Image source={pic(item.photo)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />

          {/* кадр: обложка во весь экран или фото карточкой на размытой обложке */}
          {f === 'cover' ? (
            <Cover key={`${item.id}-cover`} photo={item.photo} paused={paused} fade={!swiped} />
          ) : (
            <PhotoCard key={`${item.id}-${frame}`} cover={item.photo} photo={f} i={frame} width={width} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} locations={[0, 0.25]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} locations={[0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

          {/* верх: полоски кадров этой идеи и шапка */}
          <Animated.View style={[s.top, { top: insets.top + 8 }, chrome]} pointerEvents="box-none">
            <View style={s.bars} accessibilityLabel={`Идея ${page + 1} из ${items.length}, кадр ${frame + 1} из ${frames.length}`}>
              {frames.map((_, i) => (
                <Bar key={i} state={i < frame ? 'done' : i === frame ? 'now' : 'next'} progress={progress} />
              ))}
            </View>
            <View style={s.head} pointerEvents="box-none">
              <Image source={pic(item.photo)} style={s.thumb} contentFit="cover" cachePolicy="memory-disk" />
              <View style={{ flex: 1 }}>
                <Text style={s.headTitle} numberOfLines={1}>{item.source === 'phone' ? 'Ваш альбом · с телефона' : 'Идея книги · ещё не заказана'}</Text>
                <Text style={s.headSub} numberOfLines={1}>{item.meta}</Text>
              </View>
              <Tap onPress={dismiss} hitSlop={12} style={s.close} accessibilityRole="button" accessibilityLabel="Закрыть">
                <XIcon size={22} color="#fff" weight="bold" />
              </Tap>
            </View>
          </Animated.View>

          {/* низ: на обложке — название и описание; на фото — «из книги» */}
          <Animated.View style={[s.bottom, { bottom: insets.bottom + 16 }, chrome]} pointerEvents="box-none">
            <View pointerEvents="none" style={{ alignItems: 'center', gap: 10 }}>
              {f === 'cover' ? (
                <>
                  <OverlapTitle key={item.id} text={item.title} size={titleSize} maxWidth={width - 44} enter={!swiped} />
                  <Text style={s.desc}>{item.desc}</Text>
                </>
              ) : (
                <Animated.Text key={`cap-${frame}`} entering={FadeIn.duration(250)} style={s.caption}>
                  Войдёт в книгу «{item.title}» · {frame} из {frames.length - 1}
                </Animated.Text>
              )}
            </View>
            <Tap
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onOpenBook(item.id);
              }}
              accessibilityRole="button"
              style={{ alignSelf: 'stretch' }}>
              <Glass style={s.cta} interactive>
                <Text style={s.ctaText}>Собрать эту книгу</Text>
                <CaretRightIcon size={16} color={colors.fg} weight="bold" />
              </Glass>
            </Tap>
          </Animated.View>
          </View>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Соседний альбом за краем экрана — так же, как его первый кадр (обложка, затемнения, название и описание),
 * чтобы при свайпе его было видно сразу, а после перехода ничего не прыгало.
 */
function AlbumPeek({ item, left }: { item: Suggestion; left: number }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const titleSize = Math.max(34, Math.min(48, Math.round(width * 0.112)));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { left, right: -left }]}>
      <Image source={pic(item.photo)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} locations={[0, 0.25]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
      <View style={[s.bottom, { bottom: insets.bottom + 16 + 58 + 22 }]}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <OverlapTitle text={item.title} size={titleSize} maxWidth={width - 44} />
          <Text style={s.desc}>{item.desc}</Text>
        </View>
      </View>
    </View>
  );
}

/** Обложка во весь экран, медленно приближается (на паузе — замирает). */
function Cover({ photo, paused, fade = true }: { photo: Pic; paused: boolean; fade?: boolean }) {
  const zoom = useSharedValue(1);
  useEffect(() => {
    if (paused) return cancelAnimation(zoom);
    zoom.set(withTiming(1.12, { duration: FRAME_MS * 2, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }));
  }, [paused, zoom]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  return (
    <Animated.View entering={fade ? FadeIn.duration(220) : undefined} style={[StyleSheet.absoluteFill, a]}>
      <Image source={pic(photo)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
    </Animated.View>
  );
}

/** Фото из будущей книги — карточкой с белыми полями на размытой обложке; каждая чуть повёрнута по-своему. */
function PhotoCard({ cover, photo, i, width }: { cover: Pic; photo: Pic; i: number; width: number }) {
  const w = width * 0.74;
  const tilt = [-3, 2.5, -1.5, 3][i % 4];
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={pic(cover)} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} cachePolicy="memory-disk" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,16,14,0.35)' }]} />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }]}>
        <Animated.View entering={FadeIn.duration(260)} style={[s.card, { width: w, height: w * 1.22, transform: [{ rotate: `${tilt}deg` }] }]}>
          <Image source={pic(photo)} style={{ flex: 1, borderRadius: 4 }} contentFit="cover" cachePolicy="memory-disk" />
        </Animated.View>
      </View>
    </View>
  );
}

function Bar({ state, progress }: { state: 'done' | 'now' | 'next'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${(state === 'now' ? progress.value : state === 'done' ? 1 : 0) * 100}%` }));
  return (
    <View style={s.bar}>
      <Animated.View style={[s.barFill, fill]} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111', overflow: 'hidden' },
  top: { position: 'absolute', left: 12, right: 12, gap: 12 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  thumb: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' },
  headTitle: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  headSub: { fontSize: 12.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.78)', marginTop: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 18, right: 18, gap: 22 },
  desc: { fontSize: 16, lineHeight: 22, fontFamily: fonts.accent, color: 'rgba(255,255,255,0.9)', textAlign: 'center', maxWidth: 320 },
  caption: { fontSize: 15, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.92)', textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 8, paddingBottom: 28, borderRadius: 6, boxShadow: '0 18px 40px rgba(0,0,0,0.35)' },
  cta: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaText: { fontSize: 17, fontFamily: fonts.bold, color: colors.fg, letterSpacing: -0.2 },
});
