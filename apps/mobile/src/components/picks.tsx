/**
 * Подборка на весь экран — как история: сверху полоски, касание справа — следующая, слева — предыдущая,
 * удержание — пауза. Внизу одна кнопка «Смотреть книгу». Открывается с кружка на главной.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { CaretRightIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '@/components/glass';
import { OverlapTitle } from '@/components/home';
import { Tap } from '@/components/ui';
import type { Suggestion } from '@/data/demo';
import { pic } from '@/data/photos';
import { colors, fonts } from '@/theme';

const SLIDE_MS = 6000;

export function PicksViewer({
  items,
  start,
  onClose,
  onSeen,
  onOpenBook,
}: {
  items: Suggestion[];
  /** с какой подборки открыть; null — закрыто */
  start: number | null;
  onClose: () => void;
  onSeen: (id: string) => void;
  onOpenBook: (id: string) => void;
}) {
  return (
    <Modal visible={start !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {start !== null ? <Viewer key={start} items={items} start={start} onClose={onClose} onSeen={onSeen} onOpenBook={onOpenBook} /> : null}
    </Modal>
  );
}

function Viewer({ items, start, onClose, onSeen, onOpenBook }: { items: Suggestion[]; start: number; onClose: () => void; onSeen: (id: string) => void; onOpenBook: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(start);
  const [paused, setPaused] = useState(false);
  const progress = useSharedValue(0);
  const zoom = useSharedValue(1);
  const item = items[page];

  const go = (d: 1 | -1) => {
    const next = page + d;
    if (next >= items.length) return onClose();
    setPage(Math.max(0, next));
  };

  // открыли подборку — она просмотрена; кадр медленно приближается
  useEffect(() => {
    onSeen(items[page].id);
    zoom.value = 1;
    zoom.value = withTiming(1.12, { duration: SLIDE_MS + 2000, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // полоска заполняется, потом — следующая подборка; пока палец на экране — пауза (WCAG 2.2.2)
  useEffect(() => {
    progress.value = 0;
    if (paused) return;
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
    const t = setTimeout(() => go(1), SLIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, paused]);

  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const titleSize = Math.max(36, Math.min(50, Math.round(width * 0.118)));

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      <Animated.View key={item.id} entering={FadeIn.duration(220)} style={[StyleSheet.absoluteFill, zoomStyle]}>
        <Image source={pic(item.photo)} style={StyleSheet.absoluteFill} contentFit="cover" />
      </Animated.View>
      <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} locations={[0, 0.28]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* касание: слева — назад, справа — дальше; удержание — пауза */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
        {([-1, 1] as const).map((d) => (
          <Pressable
            key={d}
            style={{ flex: d === -1 ? 1 : 2 }}
            onPressIn={() => setPaused(true)}
            onPressOut={() => setPaused(false)}
            onLongPress={() => {}}
            onPress={() => go(d)}
            accessibilityRole="button"
            accessibilityLabel={d === -1 ? 'Предыдущая подборка' : 'Следующая подборка'}
          />
        ))}
      </View>

      {/* верх: полоски и шапка */}
      <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={s.bars} accessibilityLabel={`Подборка ${page + 1} из ${items.length}`}>
          {items.map((it, i) => (
            <Bar key={it.id} state={i < page ? 'done' : i === page ? 'now' : 'next'} progress={progress} />
          ))}
        </View>
        <View style={s.head} pointerEvents="box-none">
          <Image source={pic(item.photo)} style={s.thumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.headTitle} numberOfLines={1}>Собрали для вас</Text>
            <Text style={s.headSub} numberOfLines={1}>{item.meta}</Text>
          </View>
          <Tap onPress={onClose} hitSlop={12} style={s.close} accessibilityRole="button" accessibilityLabel="Закрыть">
            <XIcon size={22} color="#fff" weight="bold" />
          </Tap>
        </View>
      </View>

      {/* низ: название, пара слов и одна кнопка */}
      <View style={[s.bottom, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <View pointerEvents="none" style={{ alignItems: 'center', gap: 10 }}>
          <OverlapTitle key={item.id} text={item.title} size={titleSize} maxWidth={width - 44} enter />
          <Text style={s.desc}>{item.desc}</Text>
        </View>
        <Tap
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onOpenBook(item.id);
          }}
          accessibilityRole="button"
          style={{ alignSelf: 'stretch' }}>
          <Glass style={s.cta} interactive>
            <Text style={s.ctaText}>Смотреть книгу</Text>
            <CaretRightIcon size={16} color={colors.fg} weight="bold" />
          </Glass>
        </Tap>
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
  cta: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaText: { fontSize: 17, fontFamily: fonts.bold, color: colors.fg, letterSpacing: -0.2 },
});
