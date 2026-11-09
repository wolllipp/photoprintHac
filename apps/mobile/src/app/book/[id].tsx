/**
 * «Книга и цена» (путь А): книга на сцене, параметры и цена в шторке, тарифы — как в Яндекс Go.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CaretLeftIcon, CheckIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Photo, Tap } from '@/components/ui';
import { drafts, tariffs, type Tariff } from '@/data/demo';
import { rub, useStore } from '@/data/store';
import { flickSpring, sheetSpring } from '@/motion';
import { colors, fonts } from '@/theme';

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const draft = drafts[id ?? 'karelia'] ?? drafts.karelia;
  const insets = useSafeAreaInsets();
  const { addToCart } = useStore();
  const [tariff, setTariff] = useState<Tariff>(tariffs[1]);
  const [finish, setFinish] = useState<'Глянец' | 'Зерно'>('Глянец');

  /* ---- шторка: тянется за пальцем 1:1, отпускание — по проекции скорости (apple-design) ---- */
  const ty = useSharedValue(0); // 0 — раскрыта, maxOffset — свёрнута до заголовка
  const start = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const headBottom = useSharedValue(0);
  const bottomInset = insets.bottom;
  const onSheetLayout = (e: LayoutChangeEvent) => { sheetH.value = e.nativeEvent.layout.height; };
  const onHeadLayout = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    headBottom.value = y + height;
  };
  // считаем на лету: onLayout ребёнка приходит раньше родителя
  const maxOffset = () => {
    'worklet';
    return Math.max(0, sheetH.value - headBottom.value - 22 - bottomInset);
  };
  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      start.value = ty.value;
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.value + e.translationY;
      // резиновое сопротивление за границами вместо жёсткой остановки
      if (next < 0) ty.value = next * 0.25;
      else if (next > maxOffset()) ty.value = maxOffset() + (next - maxOffset()) * 0.25;
      else ty.value = next;
    },
    onDeactivate: (e) => {
      'worklet';
      const projected = ty.value + (e.velocityY / 1000) * 0.998 / (1 - 0.998) * 0.2;
      const target = projected > maxOffset() / 2 ? maxOffset() : 0;
      ty.value = withSpring(target, { ...flickSpring, velocity: e.velocityY });
    },
  });
  const toggle = () => { ty.value = withSpring(ty.value > 1 ? 0 : maxOffset(), sheetSpring); };
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const stageStyle = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, sheetH.value - ty.value) }));

  const onAdd = () => {
    addToCart({
      projectId: id ?? 'karelia',
      title: draft.title,
      tariff: tariff.id,
      tariffName: tariff.name,
      format: draft.format,
      pages: draft.pages,
      finish,
      price: tariff.price,
      readyBy: tariff.readyBy,
      cover: 'g1',
    });
    router.push('/checkout');
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
          <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
        <Text style={s.navTitle} numberOfLines={1}>{draft.title}</Text>
        <Tap style={[s.round, s.edit]} accessibilityRole="button">
          <Text style={s.editText}>Править</Text>
        </Tap>
      </View>

      {/* сцена: разворот книги */}
      <Animated.View style={[s.stage, stageStyle]}>
        <View style={s.spread}>
          <View style={[s.leaf, s.leafLeft]}>
            <Photo k="g1" style={{ flex: 1.4, borderRadius: 4 }} />
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              <Photo k="g3" style={{ flex: 1, borderRadius: 4 }} />
              <Photo k="g5" style={{ flex: 1, borderRadius: 4 }} />
            </View>
          </View>
          <View style={[s.leaf, s.leafRight]}>
            <Photo k="g2" style={{ flex: 1.2, borderRadius: 4 }} />
            <Photo k="g4" style={{ flex: 1, borderRadius: 4 }} />
          </View>
        </View>
        <View style={s.okPill} accessibilityRole="text">
          <View style={s.okDot}><CheckIcon size={12} color="#fff" weight="bold" /></View>
          <Text style={s.okText}>Лица в кадре · резкость в норме</Text>
        </View>
      </Animated.View>

      {/* шторка */}
      <Animated.View style={[s.sheet, { paddingBottom: insets.bottom + 12 }, sheetStyle]} onLayout={onSheetLayout}>
        <GestureDetector gesture={pan}>
          <View>
            <Tap style={s.handle} onPress={toggle} accessibilityRole="button" accessibilityLabel="Свернуть или развернуть параметры" hitSlop={6}>
              <View style={s.grab} />
            </Tap>
            <View style={s.sheetHead} onLayout={onHeadLayout}>
              <Text style={s.sheetTitle}>Фотокнига</Text>
              <Text style={s.sheetMeta}>{tariff.name} · {rub(tariff.price)} · {draft.pages} стр.</Text>
            </View>
          </View>
        </GestureDetector>

        <View style={s.tariffs} accessibilityRole="radiogroup">
          {tariffs.map((t) => {
            const on = t.id === tariff.id;
            return (
              <Tap
                key={t.id}
                style={[s.tariff, on && s.tariffOn]}
                onPress={() => setTariff(t)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.name}, ${rub(t.price)}, будет ${t.readyBy}`}>
                <View style={s.bk}>
                  <LinearGradient colors={t.cover} style={[s.bookIcon, t.tall && { width: 26, height: 38 }]} />
                </View>
                <Text style={s.tName}>{t.name}</Text>
                <Text style={s.tPrice}>{rub(t.price)}</Text>
                <Text style={s.tWhen}>будет {t.readyBy}</Text>
              </Tap>
            );
          })}
        </View>
        <Text style={s.about}>{tariff.about}</Text>

        <View style={s.seg} accessibilityRole="radiogroup">
          {(['Глянец', 'Зерно'] as const).map((f) => (
            <Tap key={f} style={[s.segItem, f === finish && s.segOn]} onPress={() => setFinish(f)} accessibilityRole="radio" accessibilityState={{ selected: f === finish }}>
              <Text style={[s.segText, f === finish && s.segTextOn]}>{f}</Text>
            </Tap>
          ))}
        </View>

        <Tap style={s.cta} onPress={onAdd} accessibilityRole="button">
          <Text style={s.ctaText}>В корзину · {rub(tariff.price)}</Text>
        </Tap>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
  edit: { width: 'auto', paddingHorizontal: 12 },
  editText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  spread: {
    width: '100%', aspectRatio: 2 / 1.05, flexDirection: 'row', transform: [{ rotate: '-3deg' }],
    shadowColor: '#232B2A', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 22 }, elevation: 8,
  },
  leaf: { flex: 1, padding: 8, gap: 6, backgroundColor: '#FFFDF9' },
  leafLeft: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  leafRight: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  okPill: {
    position: 'absolute', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingVertical: 7, paddingLeft: 8, paddingRight: 12,
  },
  okDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  okText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.fg },

  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 4, gap: 14,
    shadowColor: '#232B2A', shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: -10 }, elevation: 12,
  },
  handle: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 24 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 18 },
  sheetTitle: { fontSize: 21, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  sheetMeta: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },

  tariffs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  tariff: { flex: 1, borderRadius: 18, backgroundColor: colors.bg, padding: 10, paddingBottom: 12, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  tariffOn: { backgroundColor: colors.coralTint, borderColor: colors.coralAction },
  bk: { height: 40, justifyContent: 'flex-end', marginBottom: 4 },
  bookIcon: { width: 34, height: 34, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  tName: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  tPrice: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },
  tWhen: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  about: { fontSize: 14, fontFamily: fonts.regular, color: colors.mut, paddingHorizontal: 18, marginTop: -4 },

  seg: { flexDirection: 'row', backgroundColor: colors.card2, borderRadius: 12, padding: 3, marginHorizontal: 18 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: colors.card, shadowColor: '#232B2A', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  segTextOn: { color: colors.fg, fontFamily: fonts.semibold },

  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff', letterSpacing: -0.15 },
});

