/**
 * Путь Б, шаг 3 — «Отбор фото»: что выбрал ИИ и почему; любое фото можно вернуть или убрать касанием.
 * В продукте — GET/PATCH /projects/{id}/selection.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CheckIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { type PhotoName, pic } from '@/data/photos';
import { AnimatedNumber, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const GRID: { k: PhotoName; on: boolean }[] = [
  { k: 'city-sunset', on: true }, { k: 'friends-night', on: true }, { k: 'cafe-interior', on: false }, { k: 'night-window', on: true },
  { k: 'roses', on: true }, { k: 'birthday-cake', on: false }, { k: 'friends-selfie', on: true }, { k: 'concert', on: false },
  { k: 'bouquet', on: true }, { k: 'cafe-dessert', on: true }, { k: 'city-sunset', on: false }, { k: 'friends-night', on: true },
];
const BASE = 38; // столько выбрал ИИ из 214
const BASE_ON = GRID.filter((g) => g.on).length;

export default function Select() {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState(GRID.map((g) => g.on));
  const count = BASE + sel.filter(Boolean).length - BASE_ON;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="Отбор фото" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <View style={s.headRow}>
            <Text style={s.small}>Выбрано для книги</Text>
            <Text style={s.small}>4 главы</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessibilityLiveRegion="polite">
            <AnimatedNumber value={count} format={String} style={s.big} />
            <Text style={s.of}>из 214 фото</Text>
          </View>
          <View style={s.grid}>
            {GRID.map((g, i) => (
              <Cell
                key={i}
                index={i}
                k={g.k}
                on={sel[i]}
                onToggle={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSel((v) => v.map((x, j) => (j === i ? !x : x)));
                }}
              />
            ))}
          </View>
        </View>

        <View style={s.stats}>
          <Stat n="−41" label="дубли и серии" />
          <Stat n="−17" label="смазанные и тёмные" />
          <Stat n="−23" label="скриншоты" />
        </View>

        <View style={s.hint}>
          <Text style={s.hintText}>
            Из 133 похожих пейзажей оставили самые разные. <Text style={{ fontFamily: fonts.bold }}>Любое фото можно вернуть</Text> — нажмите на него.
          </Text>
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={() => router.replace({ pathname: '/book/[id]', params: { id: 'karelia' } })} accessibilityRole="button">
          <Text style={s.ctaText}>Смотреть книгу</Text>
        </Tap>
      </View>
    </View>
  );
}

/** Клетка отбора: убранное фото уменьшается и бледнеет, возвращённое — пружинит обратно, галочка выпрыгивает. */
function Cell({ index, k, on, onToggle }: { index: number; k: PhotoName; on: boolean; onToggle: () => void }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(on ? 1 : 0, { damping: 16, stiffness: 220, reduceMotion: ReduceMotion.System });
  }, [on, v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value, transform: [{ scale: 0.86 + 0.14 * v.value }] }));
  return (
    <Animated.View entering={enterItem(index % 4 + Math.floor(index / 4))} style={s.cell}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`Фото ${index + 1}`}>
        <Animated.View style={[StyleSheet.absoluteFill, s.cellPhoto, a]}>
          <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
        {on ? (
          <Animated.View
            entering={ZoomIn.springify().damping(13).reduceMotion(ReduceMotion.System)}
            exiting={ZoomOut.duration(120)}
            style={s.check}>
            <CheckIcon size={11} color="#fff" weight="bold" />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, gap: 14, paddingBottom: 16 },
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  big: { fontSize: 44, fontFamily: fonts.display, letterSpacing: -1.3, color: colors.fg, fontVariant: ['tabular-nums'] },
  of: { fontSize: 17, fontFamily: fonts.regular, color: colors.mut },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: '24.2%', aspectRatio: 1 },
  cellPhoto: { borderRadius: 8, overflow: 'hidden' },
  check: {
    position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.coralAction, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  statN: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg, fontVariant: ['tabular-nums'] },
  statL: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, textAlign: 'center' },
  hint: { backgroundColor: colors.peach, borderRadius: 26, padding: 16 },
  hintText: { fontSize: 14, fontFamily: fonts.regular, lineHeight: 20, color: colors.fg },
  bottom: { paddingHorizontal: 18, paddingTop: 10 },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
