/**
 * Путь Б, шаг 3 — «Отбор фото»: что выбрал ИИ и почему; любое фото можно вернуть или убрать касанием.
 * Крупный заголовок слева (как в корзине), число выбранных пересчитывается, сетка настоящих фото
 * с клетками фиксированного размера, три плитки «что убрали», подсказка и «Смотреть книгу».
 * В продукте — GET/PATCH /projects/{id}/selection.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CheckIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { pic, type PhotoName } from '@/data/photos';
import { AnimatedNumber, ease } from '@/motion';
import { colors, fonts } from '@/theme';

const LIB: PhotoName[] = ['city-sunset', 'friends-night', 'cafe-interior', 'night-window', 'roses', 'birthday-cake', 'friends-selfie', 'concert', 'bouquet', 'cafe-dessert'];
// 16 кадров (4×4); часть ИИ убрал — их можно вернуть
const GRID = Array.from({ length: 16 }, (_, i) => ({ k: LIB[(i * 3) % LIB.length], on: i % 5 !== 2 }));
const BASE = 38; // столько выбрал ИИ из 214
const BASE_ON = GRID.filter((g) => g.on).length;
const GAP = 6;

export default function Select() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [sel, setSel] = useState(GRID.map((g) => g.on));
  const count = BASE + sel.filter(Boolean).length - BASE_ON;
  const cell = Math.floor((width - 32 - GAP * 3) / 4);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(420).easing(ease.smoothOut)} style={{ gap: 4 }}>
          <Text style={s.title}>Отбор фото</Text>
          <View style={s.countRow} accessibilityLiveRegion="polite">
            <AnimatedNumber value={count} format={String} style={s.count} />
            <Text style={s.of}>из 214 · 4 главы</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(420).easing(ease.smoothOut)} style={s.grid}>
          {GRID.map((g, i) => (
            <Cell
              key={i}
              k={g.k}
              size={cell}
              on={sel[i]}
              n={i + 1}
              onToggle={() => {
                Haptics.selectionAsync().catch(() => {});
                setSel((v) => v.map((x, j) => (j === i ? !x : x)));
              }}
            />
          ))}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(420).easing(ease.smoothOut)} style={s.stats}>
          <Stat n="−41" label={'дубли\nи серии'} />
          <Stat n="−17" label={'смазанные\nи тёмные'} />
          <Stat n="−23" label={'скриншоты\nи чеки'} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(420).easing(ease.smoothOut)} style={s.hint}>
          <Text style={s.hintText}>Из 133 похожих пейзажей оставили самые разные. Любое фото можно вернуть — нажмите на него.</Text>
        </Animated.View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={() => router.replace({ pathname: '/book/[id]', params: { id: 'karelia' } })} accessibilityRole="button">
          <Text style={s.ctaText}>Смотреть книгу</Text>
        </Tap>
      </View>
    </View>
  );
}

/** Клетка: убранное фото уменьшается и бледнеет, возвращённое — пружинит обратно, галочка выпрыгивает. */
function Cell({ k, size, on, n, onToggle }: { k: PhotoName; size: number; on: boolean; n: number; onToggle: () => void }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(on ? 1 : 0, { damping: 18, stiffness: 220, reduceMotion: ReduceMotion.System });
  }, [on, v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value, transform: [{ scale: 0.88 + 0.12 * v.value }] }));
  return (
    <Pressable
      onPress={onToggle}
      style={{ width: size, height: size }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`Фото ${n}${on ? ', в книге' : ', убрано'}`}>
      <Animated.View style={[s.cellPhoto, { width: size, height: size }, a]}>
        <Image source={pic(k)} style={{ width: size, height: size }} contentFit="cover" />
      </Animated.View>
      {on ? (
        <Animated.View entering={ZoomIn.duration(180)} exiting={ZoomOut.duration(120)} style={s.check}>
          <CheckIcon size={11} color="#fff" weight="bold" />
        </Animated.View>
      ) : null}
    </Pressable>
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
  content: { paddingHorizontal: 16, gap: 16 },
  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  count: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.coralAction },
  of: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cellPhoto: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card2 },
  check: {
    position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.coralAction, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },

  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, height: 96, backgroundColor: colors.card, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 },
  statN: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg, textAlign: 'center' },
  statL: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center' },

  hint: { backgroundColor: colors.peach, borderRadius: 22, padding: 16 },
  hintText: { fontSize: 14.5, lineHeight: 20, fontFamily: fonts.medium, color: colors.fg, textAlign: 'center' },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
