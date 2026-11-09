/**
 * Превью книги — что получится, до сборки. По референсу профиля: сверху сцена (книга на размытой
 * обложке, к низу уходит в белый), крупное название, кнопка «Собрать» с ценой и круглая «Править»,
 * строка цифр «Страниц · Фото · Цена», описание от ИИ, развороты сеткой.
 * Книга пока объёмная статичная (корешок, срез страниц, тень); «живая» 3D-книга — следующим шагом.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDownIcon, CaretLeftIcon, PencilSimpleIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlapTitle } from '@/components/home';
import { Tap } from '@/components/ui';
import { spreads, tariffs, type PageLayout, type Spread } from '@/data/demo';
import { pic, type Pic } from '@/data/photos';
import { rub } from '@/data/store';
import { AnimatedNumber, ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Preview() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const p = useLocalSearchParams<{ title?: string; pages?: string; photos?: string; about?: string; format?: string; lam?: string }>();
  const title = p.title ?? 'Карелия, июль';
  const pages = Number(p.pages ?? 24);
  const picked = Math.round(pages * 1.6); // сколько кадров встанет в книгу
  const price = tariffs[1].price;
  // сцена почти на весь экран: сначала видно снимки, название и кнопки, описание — уже при прокрутке
  // сцена такой высоты, чтобы кнопка «Выбрать тариф» кончалась в 64 точках от низа: там — «Пролистните»,
  // цифры и описание — уже ниже края (название ~120, подпись и отступы ~50, кнопка 56, наплыв на снимок −0,2 ширины)
  const STAGE = Math.round(Math.max(width * 1.1, height - 64 - (226 - width * 0.2)));
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<{ i: number; from: Rect } | null>(null); // открытый крупно разворот и откуда вырос
  const cells = useRef<(ComponentRef<typeof View> | null)[]>([]);

  // книга уже собрана: дальше — выбрать тариф и в корзину
  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({ pathname: '/book/[id]', params: { id: 'karelia' } });
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const v = e.nativeEvent.contentOffset.y > 40;
          if (v !== scrolled) setScrolled(v);
        }}>
        {/* сцена: кадры альбома фоном сменяют друг друга, к низу уходят в белый */}
        <View style={{ height: STAGE, overflow: 'hidden' }}>
          <Slideshow shots={SHOTS} />
          {/* переход в белый — плавной кривой из нескольких ступеней, без видимого края даже на тёмных снимках */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0.68)', 'rgba(255,255,255,0.9)', '#fff']}
            locations={[0.55, 0.64, 0.72, 0.8, 0.87, 0.94, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={s.body}>
          {/* название с наплывом наезжает на низ стопки */}
          <View style={{ marginTop: -Math.round(width * 0.2), zIndex: 5 }}>
            <OverlapTitle text={title} size={64} maxWidth={width - 40} rgb="29,33,32" warm enter />
          </View>
          <Animated.Text entering={FadeInDown.delay(60).duration(420).easing(ease.smoothOut)} style={s.kind}>
            Фотокнига Classic {p.format ?? '20×20'} · {p.lam ?? 'глянцевая'} ламинация
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(120).duration(420).easing(ease.smoothOut)} style={s.actions}>
            <Tap style={s.cta} onPress={next} accessibilityRole="button" accessibilityLabel={`Выбрать тариф, от ${rub(price)}`}>
              <Text style={s.ctaText}>Выбрать тариф</Text>
            </Tap>
            <Tap style={s.edit} onPress={() => router.push({ pathname: '/editor', params: { id: 'karelia' } })} accessibilityRole="button" accessibilityLabel="Править">
              <PencilSimpleIcon size={20} color={colors.fg} weight="bold" />
            </Tap>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(420).easing(ease.smoothOut)} style={s.stats}>
            <Stat value={<AnimatedNumber value={pages} format={String} style={s.statNum} />} label="страниц" />
            <Tap style={{ flex: 1 }} onPress={() => router.push('/select')} accessibilityRole="button" accessibilityLabel={`${picked} фото, посмотреть отбор`}>
              <Stat value={<AnimatedNumber value={picked} format={String} style={[s.statNum, { color: colors.coralAction }]} />} label="фото ›" />
            </Tap>
            <Stat value={<Text style={s.statNum}>{rub(price).replace(' р.', '')}</Text>} label="рублей" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(420).easing(ease.smoothOut)} style={s.about}>
            <Text style={s.aboutText}>
              {p.about ??
                `Тёплая книга о поездке: ${picked} лучших кадров из ${p.photos ?? 214}, без дублей и смазанных. Пейзажи — на целый разворот, люди — крупно, лица не попадут в обрез.`}
            </Text>
          </Animated.View>

          <Text style={s.h2}>Развороты</Text>
          <View style={s.grid}>
            {spreads.map((sp, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(300 + i * 60).duration(420).easing(ease.smoothOut)} style={s.cell}>
                <Tap
                  onPress={() => cells.current[i]?.measureInWindow((x, y, w, h) => setOpen({ i, from: { x, y, w, h } }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Открыть разворот ${i + 1} крупно`}>
                  <View ref={(v) => { cells.current[i] = v; }} collapsable={false}>
                    <MiniSpread sp={sp} />
                  </View>
                </Tap>
                <Text style={s.cellLabel}>{i === 0 ? 'Обложка и начало' : `Разворот ${i + 1}`}</Text>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* подсказка: ниже есть описание и развороты */}
      {!scrolled ? (
        <Animated.View entering={FadeIn.delay(900).duration(500)} exiting={FadeOut.duration(200)} style={[s.scrollHint, { bottom: insets.bottom + 6 }]} pointerEvents="none">
          <Text style={s.scrollHintText}>Пролистните</Text>
          <Bob />
        </Animated.View>
      ) : null}

      {/* разворот крупно: листаются соседние, закрыть — крестиком */}
      <Modal visible={open !== null} transparent animationType="none" onRequestClose={() => setOpen(null)}>
        {open !== null ? <Viewer start={open.i} from={open.from} onClose={() => setOpen(null)} /> : null}
      </Modal>

      {/* назад — стеклянная кнопка поверх сцены */}
      <Tap style={[s.back, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
        <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
      </Tap>
    </View>
  );
}

/** Стрелка вниз мягко покачивается. */
function Bob() {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withSequence(withTiming(4, { duration: 650, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) })), -1, false);
  }, [y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={a}>
      <ArrowDownIcon size={16} color={colors.mut} weight="bold" />
    </Animated.View>
  );
}

/** Кадры альбома для фона. */
const SHOTS: Pic[] = ['night-window', 'city-sunset', 'friends-night', 'cafe-dessert', 'roses', 'friends-selfie'];
const EVERY = 5000;

/** Фон-слайдшоу: кадр медленно приближается, через 3 с мягко сменяется следующим. */
function Slideshow({ shots }: { shots: Pic[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % shots.length), EVERY);
    return () => clearInterval(t);
  }, [shots.length]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View key={i} entering={FadeIn.duration(1400)} exiting={FadeOut.duration(1400)} style={StyleSheet.absoluteFill}>
        <Slow k={shots[i]} />
      </Animated.View>
    </View>
  );
}
function Slow({ k }: { k: Pic }) {
  const z = useSharedValue(1);
  useEffect(() => {
    z.value = withTiming(1.1, { duration: EVERY + 900, easing: Easing.linear });
  }, [z]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: z.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, a]}>
      <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Просмотр разворотов крупно. Разворот вырастает из миниатюры, на которую нажали, и встаёт по центру;
 * свайпом — к соседним; нажатие мимо разворота или крестик — уменьшается обратно в своё место.
 */
function Viewer({ start, from, onClose }: { start: number; from: Rect; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(start);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const p = useSharedValue(0); // 0 — в миниатюре, 1 — по центру
  const W = width - 24;
  const H = W / (2 / 1.05);
  useEffect(() => {
    p.value = withSpring(1, { damping: 26, stiffness: 240 });
  }, [p]);
  const close = () => {
    // своя миниатюра — улетаем в неё, чужая (долистали) — просто гаснем
    p.set(
      withTiming(0, { duration: 260, easing: ease.smoothOut }, (d) => {
        if (d) scheduleOnRN(onClose);
      }),
    );
  };
  const bg = useAnimatedStyle(() => ({ opacity: p.value }));
  const grow = useAnimatedStyle(() => {
    if (page !== start) return { opacity: p.value };
    const sc = from.w / W + (1 - from.w / W) * p.value;
    const dx = (from.x + from.w / 2 - width / 2) * (1 - p.value);
    const dy = (from.y + from.h / 2 - height / 2) * (1 - p.value);
    return { transform: [{ translateX: dx }, { translateY: dy }, { scale: sc }] };
  });
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* фон — нажатие мимо разворота закрывает */}
      <Animated.View style={[StyleSheet.absoluteFill, s.viewerBg, bg]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }, grow]} pointerEvents="box-none">
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          ref={pager}
          contentOffset={{ x: start * width, y: 0 }}
          onLayout={() => pager.current?.scrollTo({ x: start * width, animated: false })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flexGrow: 0 }}>
          {spreads.map((sp, i) => (
            <Pressable key={i} onPress={close} style={{ width, height: H + 80, paddingHorizontal: 12, justifyContent: 'center' }}>
              {/* сам разворот нажатия не закрывает */}
              <Pressable onPress={() => {}}>
                <MiniSpread sp={sp} big />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      </Animated.View>
      <Animated.Text style={[s.viewerNo, { bottom: insets.bottom + 40 }, bg]}>
        {page === 0 ? 'Обложка и начало' : `Разворот ${page + 1}`} · {page + 1} из {spreads.length}
      </Animated.Text>
      <Animated.View style={[s.viewerClose, { top: insets.top + 8 }, bg]}>
        <Tap style={s.viewerCloseBtn} onPress={close} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
      </Animated.View>
    </View>
  );
}

const count = (l: PageLayout) => (l === 'one' ? 1 : l === 'two' ? 2 : 3);
function MiniSpread({ sp, big }: { sp: Spread; big?: boolean }) {
  const page = (layout: PageLayout, shots: Spread['photos']) => {
    const img = (k: Spread['photos'][number], flex = 1) =>
      k ? <Image key={String(k)} source={pic(k)} style={{ flex, borderRadius: 2 }} contentFit="cover" /> : <View style={{ flex, backgroundColor: colors.card2 }} />;
    return (
      <View style={s.miniPage}>
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
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {img(shots[1])}
              {img(shots[2])}
            </View>
          </>
        ) : null}
      </View>
    );
  };
  return (
    <View style={[s.mini, big && s.big]}>
      {page(sp.left, sp.photos.slice(0, count(sp.left)))}
      {page(sp.right, sp.photos.slice(count(sp.left)))}
    </View>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <View style={s.stat}>
      {value}
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  body: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 34, lineHeight: 40, fontFamily: fonts.display, letterSpacing: -0.9, color: colors.fg, textAlign: 'center' },
  kind: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center', marginTop: -4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cta: { flex: 1, height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  edit: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },

  stats: { flexDirection: 'row', paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 26, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg },
  statLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },

  about: { backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 6, alignItems: 'center' },
  aboutText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.fg, textAlign: 'center' },

  h2: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%', gap: 6 },
  scrollHint: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 2 },
  scrollHintText: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  big: { padding: 8, gap: 8, borderRadius: 14, boxShadow: '0 20px 40px -18px rgba(60,40,30,0.5), 0 0 0 1px rgba(60,40,30,0.06)' },
  viewerBg: { backgroundColor: 'rgba(255,255,255,0.96)' },
  viewerClose: { position: 'absolute', right: 16 },
  viewerCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  viewerNo: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  mini: { aspectRatio: 2 / 1.05, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, backgroundColor: '#FFFDF9', boxShadow: '0 6px 16px -10px rgba(60,40,30,0.4), 0 0 0 1px rgba(60,40,30,0.06)' },
  miniPage: { flex: 1, gap: 3 },
  cellLabel: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center' },

  back: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
});
