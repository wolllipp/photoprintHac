/**
 * «Книга и цена» (путь А): книга на сцене, параметры и цена в шторке, тарифы — как в Яндекс Go.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CaretLeftIcon, CheckIcon, MinusIcon, PencilSimpleIcon, PlusIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddedToast, useAdded } from '@/components/added';
import { Tap } from '@/components/ui';
import { bookPrice, drafts, fitFormat, FORMATS_BY_TARIFF, spreads, tariffs, type PageLayout, type Tariff } from '@/data/demo';
import { type PhotoName, pic } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber, ease, flickSpring, sheetSpring } from '@/motion';
import { colors, fonts } from '@/theme';

export default function BookScreen() {
  const params = useLocalSearchParams<{ id: string; format?: string; pages?: string; lam?: string }>();
  const id = params.id;
  const draft = drafts[id ?? 'karelia'] ?? drafts.karelia;
  const insets = useSafeAreaInsets();
  const { addToCart } = useStore();
  const [tariff, setTariff] = useState<Tariff>(tariffs[1]);
  const [finish, setFinish] = useState<'Глянец' | 'Зерно'>(params.lam === 'зернистая' ? 'Зерно' : 'Глянец');
  // формат и развороты — из диалога, если пришли оттуда; цена пересчитывается от всего сразу
  const [format, setFormat] = useState(params.format ?? draft.format);
  const [spreadsN, setSpreadsN] = useState(Math.round(Number(params.pages ?? draft.pages) / 2));
  const fmt = fitFormat(tariff.id, format);
  const priceOf = (t: Tariff) => bookPrice(t.id, fitFormat(t.id, format), spreadsN, finish);
  const price = priceOf(tariff);
  const pagesN = spreadsN * 2;

  /* ---- шторка: тянется за пальцем 1:1, отпускание — по проекции скорости (apple-design) ---- */
  const ty = useSharedValue(0); // 0 — раскрыта, maxOffset — свёрнута до заголовка
  const start = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const headBottom = useSharedValue(0);
  const bottomInset = insets.bottom;
  // разворот подстраивается под свободное место над шторкой — шторка выросла, разворот меньше
  const [space, setSpace] = useState({ stage: 0, sheet: 0 });
  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetH.value = e.nativeEvent.layout.height;
    const h = e.nativeEvent.layout.height;
    setSpace((x) => (x.sheet === h ? x : { ...x, sheet: h }));
  };
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

  const added = useAdded();
  const onAdd = () => {
    addToCart({
      projectId: id ?? 'karelia',
      title: draft.title,
      tariff: tariff.id,
      tariffName: tariff.name,
      format: fmt,
      pages: pagesN,
      finish,
      price,
      readyBy: tariff.readyBy,
      cover: draft.cover,
    });
    // в корзину — и остаёмся здесь: человек сам решит, когда оформлять
    added.show(draft.title, draft.cover);
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
          <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
        <Text style={s.navTitle} numberOfLines={1}>{draft.title}</Text>
        <Tap style={s.round} onPress={() => router.push({ pathname: '/editor', params: { id: id ?? 'karelia' } })} accessibilityRole="button" accessibilityLabel="Править в конструкторе">
          <PencilSimpleIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      {/* сцена: разворот книги */}
      <Animated.View
        style={[s.stage, stageStyle]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setSpace((x) => (x.stage === h ? x : { ...x, stage: h }));
        }}>
        <Pager pages={pagesN} maxH={space.stage && space.sheet ? space.stage - space.sheet - 70 : 0} />
        {/* проверка качества — тихой строкой под разворотом, а не плашкой поверх */}
        <View style={s.ok} accessibilityRole="text">
          <CheckIcon size={14} color={colors.tealInk} weight="bold" />
          <Text style={s.okText}>Проверено: лица в кадре, резкость в норме</Text>
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
              <View style={{ flexDirection: 'row' }}>
                <Text style={s.sheetMeta}>{fmt} · {pagesN} стр.</Text>
              </View>
            </View>
          </View>
        </GestureDetector>

        <View style={s.tariffs} accessibilityRole="radiogroup">
          {tariffs.map((t) => (
            <TariffTile key={t.id} t={t} price={priceOf(t)} on={t.id === tariff.id} onPick={() => setTariff(t)} />
          ))}
        </View>
        <Text style={s.about}>{tariff.about}</Text>

        {/* формат — только те, что есть у тарифа */}
        <View style={s.lam}>
          <Text style={s.lamLabel}>Формат</Text>
          <View style={s.lamRow} accessibilityRole="radiogroup">
            {FORMATS_BY_TARIFF[tariff.id].map((f) => {
              const on = f === fmt;
              return (
                <Tap
                  key={f}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormat(f);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && { color: '#fff' }]}>{f}</Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {/* развороты — степпер */}
        <View style={[s.lam, s.spreadsRow]}>
          <View>
            <Text style={s.lamLabel}>Разворотов</Text>
            <Text style={s.spreadsSub}>{pagesN} страниц</Text>
          </View>
          <View style={s.stepper}>
            <Tap style={s.step} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpreadsN((n) => Math.max(5, n - 1)); }} disabled={spreadsN <= 5} accessibilityRole="button" accessibilityLabel="Меньше разворотов">
              <MinusIcon size={15} color={spreadsN <= 5 ? colors.mut2 : colors.fg} weight="bold" />
            </Tap>
            <AnimatedNumber value={spreadsN} format={String} style={s.stepN} />
            <Tap style={s.step} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSpreadsN((n) => Math.min(30, n + 1)); }} disabled={spreadsN >= 30} accessibilityRole="button" accessibilityLabel="Больше разворотов">
              <PlusIcon size={15} color={spreadsN >= 30 ? colors.mut2 : colors.fg} weight="bold" />
            </Tap>
          </View>
        </View>

        {/* ламинация — пилюлями, как в вопросах ИИ */}
        <View style={s.lam}>
          <Text style={s.lamLabel}>Ламинация</Text>
          <View style={s.lamRow} accessibilityRole="radiogroup">
            {(['Глянец', 'Зерно'] as const).map((f) => {
              const on = f === finish;
              return (
                <Tap
                  key={f}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFinish(f);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}>
                  <Text style={[s.chipText, on && { color: '#fff' }]}>{f === 'Глянец' ? 'глянцевая' : 'зернистая'}</Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {/* цена уже на выбранном тарифе — на кнопке без повтора */}
        <Tap style={s.cta} onPress={onAdd} accessibilityRole="button" accessibilityLabel={`В корзину, ${tariff.name}, ${rub(price)}`}>
          <Text style={s.ctaText}>В корзину</Text>
        </Tap>
      </Animated.View>
      <AddedToast shown={added.shown} onHide={added.hide} bottom={insets.bottom + 84} />
    </View>
  );
}

/** Тариф: выбор — обводка плавно проявляется, на миг вспыхивает свечение (как допуслуги в корзине). */
function TariffTile({ t, price, on, onPick }: { t: Tariff; price: number; on: boolean; onPick: () => void }) {
  const v = useSharedValue(on ? 1 : 0);
  const glow = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(on ? 1 : 0, { duration: 260, easing: ease.smoothOut });
  }, [on, v]);
  const frame = useAnimatedStyle(() => ({
    borderColor: interpolateColor(v.value, [0, 1], ['rgba(184,79,75,0)', colors.coralAction]),
    shadowColor: colors.coralAction,
    shadowOpacity: 0.32 * glow.value,
    shadowRadius: 12 * glow.value,
    shadowOffset: { width: 0, height: 0 },
  }));
  return (
    <Pressable
      style={{ flex: 1 }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        if (!on) glow.set(withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })));
        onPick();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${t.name}, ${rub(price)}, будет ${t.readyBy}`}>
      <Animated.View style={[s.tariff, frame]}>
        <View style={s.bk}>
          <LinearGradient colors={t.cover} style={[s.bookIcon, t.tall && { width: 26, height: 38 }]} />
        </View>
        <Text style={s.tName}>{t.name}</Text>
        <AnimatedNumber value={price} format={rub} style={[s.tPrice, on && { color: colors.coralAction }]} />
        <Text style={s.tWhen}>будет {t.readyBy}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Книгу можно листать: развороты по одному, свайпом вбок; снизу — какой разворот из скольких. */
function Pager({ pages, maxH }: { pages: number; maxH: number }) {
  const { width } = useWindowDimensions();
  // ширина разворота: на всю ширину или меньше, если по высоте места мало
  const spreadW = maxH > 0 ? Math.min(width - 40, maxH * (2 / 1.05)) : width - 40;
  const { design } = useStore();
  const book = design ?? spreads;
  const [page, setPage] = useState(0);
  const total = Math.round(pages / 2);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };
  return (
    <View style={{ width, gap: 12 }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32}>
        {Array.from({ length: total }, (_, i) => book[i % book.length]).map((sp, i) => (
          <View key={i} style={{ width, alignItems: 'center' }} accessible accessibilityLabel={`Разворот ${i + 1} из ${total}`}>
            <View style={[s.spread, { width: spreadW }, sp.bg ? { backgroundColor: sp.bg } : null]}>
              <Leaf layout={sp.left} shots={sp.photos.slice(0, count(sp.left))} side="left" />
              <Leaf layout={sp.right} shots={sp.photos.slice(count(sp.left))} side="right" />
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={s.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotOn]} />
        ))}
        <Text style={s.pageNo}>{page + 1} из {total}</Text>
      </View>
    </View>
  );
}

const count = (l: PageLayout) => (l === 'one' ? 1 : l === 'two' ? 2 : 3);

function Leaf({ layout, shots, side }: { layout: PageLayout; shots: (PhotoName | null)[]; side: 'left' | 'right' }) {
  const img = (k: PhotoName | null | undefined, flex = 1) =>
    k ? <Image key={k} source={pic(k)} style={{ flex, borderRadius: 3 }} contentFit="cover" /> : <View style={{ flex, borderRadius: 3, backgroundColor: colors.card2 }} />;
  return (
    <View style={[s.leaf, side === 'left' ? s.leafLeft : s.leafRight]}>
      {layout === 'one' ? img(shots[0]) : null}
      {layout === 'two' ? (
        <>
          {img(shots[0], 1.2)}
          {img(shots[1])}
        </>
      ) : null}
      {layout === 'three' ? (
        <>
          {img(shots[0], 1.4)}
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            {img(shots[1])}
            {img(shots[2])}
          </View>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spread: {
    width: '100%', aspectRatio: 2 / 1.05, flexDirection: 'row', backgroundColor: '#FFFDF9', borderRadius: 10,
    shadowColor: '#232B2A', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 8,
  },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.card2 },
  dotOn: { width: 18, backgroundColor: colors.fg },
  pageNo: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut, marginLeft: 6, fontVariant: ['tabular-nums'] },
  leaf: { flex: 1, padding: 8, gap: 6 },
  leafLeft: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  leafRight: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  ok: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  okText: { fontSize: 13, fontFamily: fonts.medium, color: colors.tealInk },

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
  tariff: { borderRadius: 22, backgroundColor: colors.bg, padding: 12, paddingBottom: 14, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  bk: { height: 40, justifyContent: 'flex-end', marginBottom: 4 },
  bookIcon: { width: 34, height: 34, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  tName: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  tPrice: { fontSize: 16, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  tWhen: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  about: { fontSize: 14, fontFamily: fonts.regular, color: colors.mut, paddingHorizontal: 18, marginTop: -4 },

  lam: { paddingHorizontal: 18, gap: 6 },
  lamLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  lamRow: { flexDirection: 'row', gap: 6 },
  spreadsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spreadsSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderRadius: 22, padding: 3 },
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  stepN: { minWidth: 28, textAlign: 'center', fontSize: 17, fontFamily: fonts.display, color: colors.fg },
  chip: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.coralAction },
  chipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },

  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});

