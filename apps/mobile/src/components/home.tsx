/**
 * Главная в стиле «фото — сцена, интерфейс — стекло» (референсы: Layers, Panora, Olivia).
 *
 * Экран 1 — полноэкранные слайды: приветствие, затем предложенные альбомы. Текст по центру,
 * внизу стеклянная кнопка: на приветствии ведёт к плиткам, на альбоме открывает книгу.
 * Ниже — плитки-действия и «Мои альбомы».
 * Правила: стекло только поверх фото; коралловый — только главное действие; белая основа, персиковый — акцент.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowDownIcon, CaretRightIcon, DotsThreeIcon, ImagesIcon, MicrophoneIcon, QrCodeIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type StyleProp,
  type ViewStyle,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Reanimated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { BlurView } from 'expo-blur';

import { Glass, MaskedView, ProgressiveBlur } from '@/components/glass';
import { Pik, SectionHeader, SegmentBar, Tap } from '@/components/ui';
import { STAGES, tiles, welcome, type Album, type CurrentOrder, type Suggestion } from '@/data/demo';
import { photos, type PhotoName } from '@/data/photos';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

/* ====================================================================== */
/*  Полноэкранные слайды                                                   */
/* ====================================================================== */

type Slide =
  | { kind: 'welcome'; key: string; photo: PhotoName; title: string; desc: string }
  | { kind: 'album'; key: string; item: Suggestion };

export function HeroPager({
  items,
  points,
  scrollY,
  onContinue,
  onOpenBook,
  atTop,
}: {
  atTop: boolean;
  items: Suggestion[];
  points: number;
  scrollY: Animated.Value;
  onContinue: () => void;
  onOpenBook: (id: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const pager = useRef<ComponentRef<typeof ScrollView>>(null);
  const progress = useSharedValue(0);

  const slides: Slide[] = [
    { kind: 'welcome', key: 'welcome', ...welcome },
    ...items.map((item) => ({ kind: 'album' as const, key: item.id, item })),
  ];
  const current = slides[page];

  const onPage = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  // автолистание: полоска активного слайда заполняется, потом — следующий кадр (по кругу).
  // Пока палец на экране — пауза (WCAG 2.2.2: движущийся контент можно остановить).
  useEffect(() => {
    progress.value = 0;
    if (paused || !atTop) return;
    progress.value = withTiming(1, { duration: SLIDE_MS, easing: Easing.linear });
    const t = setTimeout(() => {
      const next = (page + 1) % slides.length;
      pager.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [page, paused, atTop, width, slides.length, progress]);

  // при прокрутке вниз весь кадр уходит в размытие, а текст с кнопкой гаснут вместе — ничего не наезжает
  const blurOpacity = scrollY.interpolate({ inputRange: [0, height * 0.45], outputRange: [0, 1], extrapolate: 'clamp' });
  const uiOpacity = scrollY.interpolate({ inputRange: [0, height * 0.28], outputRange: [1, 0], extrapolate: 'clamp' });

  const onButton = () => (current.kind === 'album' ? onOpenBook(current.item.id) : onContinue());

  return (
    <View style={{ width, height, overflow: 'hidden', backgroundColor: '#111' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: uiOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }]}>
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onPage}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => setPaused(true)}
          onMomentumScrollEnd={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}>
          {slides.map((sl, i) => (
            <SlideView key={sl.key} slide={sl} width={width} height={height} active={i === page} scrollY={scrollY} uiOpacity={uiOpacity} />
          ))}
        </ScrollView>
      </Animated.View>
      {/* размытие всего кадра при прокрутке вниз */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: blurOpacity }]}>
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]} />
      </Animated.View>

      {/* шапка на снимке: аватар · логотип · пики */}
      <View style={[s.top, { top: insets.top + 6 }]} pointerEvents="box-none">
        <Tap onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Профиль и настройки">
          <Glass tone="dark" style={s.avatar} interactive>
            <Text style={s.avatarText}>И</Text>
          </Glass>
        </Tap>
        <Text style={s.brand} accessibilityRole="header">PicPac</Text>
        <Tap accessibilityRole="button" accessibilityLabel={`${points} пиков, пригласить друга`}>
          <Glass tone="dark" style={s.points} interactive>
            <AnimatedNumber value={points} format={String} style={s.pointsText} />
            <Pik />
          </Glass>
        </Tap>
      </View>

      {/* низ: точки страниц и стеклянная кнопка (над нативным меню) */}
      <Animated.View style={[s.bottom, { bottom: insets.bottom + 8, opacity: uiOpacity }]} pointerEvents="box-none">
        <View style={s.dots} accessibilityLabel={`Слайд ${page + 1} из ${slides.length}`}>
          {slides.map((sl, i) => (
            <Dot key={sl.key} state={i < page ? 'done' : i === page ? 'now' : 'next'} progress={progress} />
          ))}
        </View>
        <Tap onPress={onButton} accessibilityRole="button" style={{ alignSelf: 'stretch' }}>
          <Glass style={s.cta} interactive>
            <Text style={s.ctaText}>{current.kind === 'album' ? 'Смотреть книгу' : 'Продолжить'}</Text>
            <CaretRightIcon size={16} color={colors.fg} weight="bold" />
          </Glass>
        </Tap>
        <ScrollHint onPress={onContinue} />
      </Animated.View>
    </View>
  );
}

const SLIDE_MS = 6500;

/** Фото главной — как есть, без фильтров. */
function Photo({ source, style, transition }: { source: number; style?: StyleProp<ViewStyle>; transition?: number }) {
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={transition} />
    </View>
  );
}

/** Индикатор слайда: активный — полоска, которая заполняется до перелистывания. */
function Dot({ state, progress }: { state: 'done' | 'now' | 'next'; progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({ width: `${(state === 'now' ? progress.value : state === 'done' ? 1 : 0) * 100}%` }));
  return (
    <View style={[s.dot, state === 'now' && s.dotOn]}>
      {state === 'now' ? <Reanimated.View style={[s.dotFill, fill]} /> : null}
    </View>
  );
}

/** «Листайте вниз» с мягко покачивающейся стрелкой — всегда внизу первого экрана. */
function ScrollHint({ onPress }: { onPress: () => void }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(withTiming(5, { duration: 650, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) })),
      -1, false, undefined, ReduceMotion.System,
    );
  }, [y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: 0.6 + y.value * 0.08 }));
  return (
    <Tap onPress={onPress} style={s.hint} accessibilityRole="button" accessibilityLabel="Листайте вниз" hitSlop={10}>
      <Text style={s.hintText}>Листайте вниз</Text>
      <Reanimated.View style={a}>
        <ArrowDownIcon size={16} color="#fff" weight="bold" />
      </Reanimated.View>
    </Tap>
  );
}

function SlideView({
  slide, width, height, active, scrollY, uiOpacity,
}: { slide: Slide; width: number; height: number; active: boolean; scrollY: Animated.Value; uiOpacity: Animated.AnimatedInterpolation<number> }) {
  const stretch = scrollY.interpolate({ inputRange: [-height, 0], outputRange: [2, 1], extrapolateRight: 'clamp' });
  const parallax = scrollY.interpolate({ inputRange: [-height, 0, height], outputRange: [-height / 2, 0, height * 0.35] });
  const zoom = useSharedValue(1);
  useEffect(() => {
    if (active) {
      zoom.value = 1;
      zoom.value = withTiming(1.14, { duration: SLIDE_MS + 2500, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System });
    } else {
      zoom.value = withTiming(1, { duration: 400 });
    }
  }, [active, zoom]);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const titleSize = Math.max(34, Math.min(46, Math.round(width * 0.105)));
  const titleStyle = { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.07) };
  const photo = slide.kind === 'welcome' ? slide.photo : slide.item.photo;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: parallax }, { scale: stretch }] }]}>
        <Reanimated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
          <Photo source={photos[photo]} style={StyleSheet.absoluteFill} transition={300} />
        </Reanimated.View>
      </Animated.View>
      {/* ровное затемнение под текст по центру + сверху под шапку + снизу под кнопку */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']} locations={[0, 0.2]} style={StyleSheet.absoluteFill} />
      <ProgressiveBlur from={0.7} intensity={35} tint="dark" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />

      <Animated.View style={[s.center, { opacity: uiOpacity }]} pointerEvents="none">
        {slide.kind === 'welcome' ? (
          <>
            <Text style={[s.title, titleStyle]} accessibilityRole="header">
              {slide.title}{'\n'}в <Text style={[s.titleLogo, { fontSize: titleSize }]}>PicPac</Text>
            </Text>
            <Text style={s.desc}>{slide.desc}</Text>
          </>
        ) : (
          <>
            <Glass tone="dark" style={s.eyebrow}>
              <Text style={s.eyebrowText}>Собрали для вас · {slide.item.meta}</Text>
            </Glass>
            <Text style={[s.title, titleStyle]} accessibilityRole="header">{slide.item.title}</Text>
            <Text style={s.desc}>{slide.item.desc}</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

/* ====================================================================== */
/*  Шапка для режима без приветствия (настройка выключена)                 */
/* ====================================================================== */

export function PlainTopBar({ points }: { points: number }) {
  return (
    <View style={s.plainTop}>
      <Tap onPress={() => router.push('/settings')} style={s.plainAvatar} accessibilityRole="button" accessibilityLabel="Профиль и настройки">
        <Text style={s.plainAvatarText}>И</Text>
      </Tap>
      <Text style={[s.brand, { color: colors.coral, textShadowRadius: 0 }]} accessibilityRole="header">PicPac</Text>
      <View style={s.plainPoints} accessibilityLabel={`${points} пиков`}>
        <AnimatedNumber value={points} format={String} style={[s.pointsText, { color: colors.fg }]} />
        <Pik />
      </View>
    </View>
  );
}

/* ====================================================================== */
/*  Плитки-действия                                                        */
/* ====================================================================== */

export function ActionTiles({
  order,
  onAsk,
  onMic,
  onOrder,
}: {
  order: CurrentOrder;
  onAsk: () => void;
  onMic: () => void;
  onOrder: () => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      {/* собрать книгу: поле + голос */}
      <View style={[s.tile, s.tilePeach, { gap: 12 }]}>
        <View>
          <Text style={s.tileTitle}>Собрать книгу</Text>
          <Text style={s.tileSub}>Опишите словами или скажите голосом</Text>
        </View>
        <View style={s.field}>
          <Tap style={s.fieldTap} onPress={onAsk} accessibilityRole="search" accessibilityLabel="Какую книгу соберём?">
            <Text style={s.fieldText}>Какую книгу соберём?</Text>
          </Tap>
          <Tap style={s.mic} onPress={onMic} accessibilityRole="button" accessibilityLabel="Сказать голосом" hitSlop={6}>
            <MicrophoneIcon size={17} color="#fff" weight="fill" />
          </Tap>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {/* фотопечать — плитка-фото */}
        <Tap style={[s.tile, s.tileTall, s.tilePhoto]} accessibilityRole="button" accessibilityLabel={`Фотопечать, ${tiles.printFrom}`}>
          <Photo source={photos['cafe-dessert']} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
          <Glass tone="dark" style={s.tileTag}>
            <ImagesIcon size={13} color="#fff" weight="fill" />
            <Text style={s.chipText}>{tiles.printFrom}</Text>
          </Glass>
          <Text style={s.tilePhotoTitle}>Фото-{'\n'}печать</Text>
        </Tap>

        <View style={{ flex: 1, gap: 10 }}>
          <Tap style={[s.tile, s.tileShort]} accessibilityRole="button">
            <View style={s.tileIcon}><QrCodeIcon size={20} color={colors.peachInk} weight="fill" /></View>
            <View>
              <Text style={s.tileTitleSm}>Общий альбом</Text>
              <Text style={s.tileSub}>гости по QR-коду</Text>
            </View>
          </Tap>
          <Tap style={[s.tile, s.tileShort, s.tilePeach]} accessibilityRole="button" accessibilityLabel={`Пригласить друга, ${tiles.inviteBonus}`}>
            <Pik size={30} />
            <View>
              <Text style={s.tileTitleSm}>Пригласить друга</Text>
              <Text style={s.tileSub}>{tiles.inviteBonus}</Text>
            </View>
          </Tap>
        </View>
      </View>

      {/* текущий заказ */}
      <Tap style={[s.tile, s.order]} onPress={onOrder} accessibilityRole="button" accessibilityLabel={`${order.title}, ${order.when}`}>
        <Photo source={photos.bouquet} style={s.orderThumb} />
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.orderTitle} numberOfLines={1}>{order.title}</Text>
            <Text style={s.when}>{order.when}</Text>
          </View>
          <SegmentBar total={STAGES.length} done={STAGES.indexOf(order.stage)} />
        </View>
      </Tap>
    </View>
  );
}

/* ====================================================================== */
/*  «Мои альбомы» как в Panora                                             */
/* ====================================================================== */

export function AlbumCards({ items }: { items: Album[] }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Мои альбомы" action="Все" />
      <View style={{ gap: 8 }}>
        {items.map((a) => (
          <Tap key={a.id} style={s.album} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.subtitle}`}>
            <Photo source={photos[a.photo]} style={StyleSheet.absoluteFill} transition={250} />
            <LinearGradient colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
            <View style={s.albumTop}>
              <Glass tone="dark" style={s.albumBadge}>
                <Text style={s.chipText}>{a.badge}</Text>
              </Glass>
              <Glass tone="dark" style={s.more}>
                <DotsThreeIcon size={18} color="#fff" weight="bold" />
              </Glass>
            </View>
            {/* серебристое название: заливка градиентом по маске текста (в браузере маски нет — просто белое) */}
            {Platform.OS === 'web' ? (
              <View style={s.albumTitleWrap}><Text style={[s.albumTitle, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={1}>{a.title}</Text></View>
            ) : (
              <MaskedView style={s.albumTitleWrap} maskElement={<Text style={s.albumTitle} numberOfLines={1}>{a.title}</Text>}>
                <LinearGradient colors={['rgba(255,255,255,1)', 'rgba(255,255,255,0.55)']} style={StyleSheet.absoluteFill} />
              </MaskedView>
            )}
          </Tap>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  plainTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  plainAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  plainAvatarText: { fontSize: 16, fontFamily: fonts.bold, color: colors.peachInk },
  plainPoints: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 6, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(35,43,42,0.12)' },
  /* слайды */
  top: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
  brand: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: -1,
    fontFamily: fonts.logo, fontSize: 28, color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 2 },
  },
  points: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 6, borderRadius: 16 },
  pointsText: { fontSize: 15, fontFamily: fonts.bold, color: '#fff', fontVariant: ['tabular-nums'] },

  center: { position: 'absolute', left: 0, right: 0, bottom: 214, alignItems: 'center', paddingHorizontal: 26, gap: 12 },
  title: { fontSize: 44, lineHeight: 47, fontFamily: fonts.display, letterSpacing: -1.6, color: '#fff', textAlign: 'center' },
  titleLogo: { fontFamily: fonts.logo, fontWeight: '400', letterSpacing: 0, fontSize: 44 },
  desc: { fontSize: 16, lineHeight: 22, fontFamily: fonts.accent, color: 'rgba(255,255,255,0.88)', textAlign: 'center', maxWidth: 320 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', height: 30, paddingHorizontal: 13, borderRadius: 15 },
  eyebrowText: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },

  bottom: { position: 'absolute', left: 18, right: 18, alignItems: 'center', gap: 12 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)', overflow: 'hidden' },
  dotOn: { width: 26, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotFill: { height: '100%', borderRadius: 3, backgroundColor: '#fff' },
  cta: { height: 58, borderRadius: 29, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  ctaText: { fontSize: 17, fontFamily: fonts.bold, color: colors.fg, letterSpacing: -0.2 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  hintText: { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.8)' },

  /* плитки */
  tile: { borderRadius: 26, backgroundColor: colors.card, padding: 16, overflow: 'hidden' },
  tilePeach: { backgroundColor: colors.peach },
  tileTall: { flex: 1, height: 238, justifyContent: 'flex-end' },
  tileShort: { height: 114, justifyContent: 'space-between' },
  tilePhoto: { padding: 14 },
  tileTitle: { fontSize: 22, fontFamily: fonts.heavy, letterSpacing: -0.6, color: colors.fg },
  tileTitleSm: { fontSize: 16, fontFamily: fonts.bold, letterSpacing: -0.2, color: colors.fg },
  tileSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  tileTag: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 10, borderRadius: 14 },
  tilePhotoTitle: { fontSize: 26, lineHeight: 27, fontFamily: fonts.display, letterSpacing: -0.8, color: '#fff' },
  field: { height: 54, borderRadius: 18, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  fieldTap: { flex: 1, height: '100%', justifyContent: 'center', paddingLeft: 16 },
  fieldText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.mut },
  mic: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  order: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 12 },
  orderThumb: { width: 44, height: 44, borderRadius: 12 },
  orderTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  when: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  chipText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },

  /* альбомы */
  album: { height: 200, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card2 },
  albumTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  albumBadge: { height: 28, paddingHorizontal: 11, borderRadius: 14, justifyContent: 'center' },
  more: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  albumTitleWrap: { position: 'absolute', left: 12, right: 0, bottom: -10, height: 76 },
  albumTitle: { fontSize: 66, lineHeight: 76, fontFamily: fonts.display, letterSpacing: -3, color: '#000' },
});
