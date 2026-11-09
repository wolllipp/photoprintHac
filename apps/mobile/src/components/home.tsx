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
import { ArrowDownIcon, BookOpenTextIcon, CaretRightIcon, DotsThreeIcon, ImagesIcon, MagicWandIcon, MicrophoneIcon, QrCodeIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
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
import { Logo } from '@/components/logo';
import { Pik, SectionHeader, SegmentBar, Tap } from '@/components/ui';
import { STAGES, tiles, welcome, type Album, type CurrentOrder, type Suggestion } from '@/data/demo';
import { type PhotoName, photos, pic } from '@/data/photos';
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
  // при потягивании вниз кадр не отъезжает от верха: сдвигаем его ровно на величину потягивания
  const pin = scrollY.interpolate({ inputRange: [-height, 0], outputRange: [-height, 0], extrapolateRight: 'clamp' });
  const edgeOpacity = scrollY.interpolate({ inputRange: [0, height * 0.18], outputRange: [0, 1], extrapolate: 'clamp' });

  const onButton = () => (current.kind === 'album' ? onOpenBook(current.item.id) : onContinue());

  return (
    <Animated.View style={{ width, height, overflow: 'hidden', backgroundColor: '#111', zIndex: 1, transform: [{ translateY: pin }] }}>
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
      {/* нижний край кадра не обрывается: размывается и тает в белый фон плиток */}
      <Animated.View pointerEvents="none" style={[s.edge, { opacity: edgeOpacity }]}>
        {/* плавная кривая без ступеньки: прозрачность растёт по ease-in, а не по прямой */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.14)', 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0.56)', 'rgba(255,255,255,0.82)', '#fff']}
          locations={[0, 0.18, 0.36, 0.54, 0.72, 0.88, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* шапка на снимке: аватар · логотип · пики */}
      <View style={[s.top, { top: insets.top + 6 }]} pointerEvents="box-none">
        <View style={s.who}>
          <Tap onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Профиль и настройки">
            <Glass tone="dark" style={s.avatar} interactive>
              <Text style={s.avatarText}>И</Text>
            </Glass>
          </Tap>
          {/* подпись слайда — справа от аватара, без стекла */}
          <View style={{ flexShrink: 1 }}>
            {current.kind === 'welcome' ? (
              <Text style={s.whoTitle} numberOfLines={1}>Добро пожаловать!</Text>
            ) : (
              <>
                <Text style={s.whoTitle} numberOfLines={1}>Собрали для вас</Text>
                <Text style={s.whoSub} numberOfLines={1}>{current.item.meta}</Text>
              </>
            )}
          </View>
        </View>
        <Tap onPress={() => router.push('/points')} accessibilityRole="button" accessibilityLabel={`${points} пиков, подробнее`}>
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
    </Animated.View>
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

/**
 * «Наплыв»: строки заглавными заходят друг на друга, нижняя лежит поверх,
 * а каждая верхняя к своему верху тает в прозрачность (градиент по маске текста).
 */
function splitLines(text: string): string[] {
  const words = text.toUpperCase().split(' ');
  if (words.length < 2) return [text.toUpperCase()];
  // делим на две строки, ближе к середине по числу букв
  let best = 1, diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < diff) { diff = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

function OverlapTitle({ text, size }: { text: string; size: number }) {
  const lines = splitLines(text);
  const lh = Math.round(size * 0.8); // строки наезжают
  const line = { fontSize: size, lineHeight: Math.round(size * 1.08), fontFamily: fonts.overlap, letterSpacing: -size * 0.04, color: '#000', textAlign: 'center' } as const;
  return (
    <View accessibilityRole="header" accessibilityLabel={text} style={{ alignItems: 'center' }}>
      {lines.map((l, i) => {
        const last = i === lines.length - 1;
        const style = { height: Math.round(size * 1.08), marginTop: i === 0 ? 0 : lh - Math.round(size * 1.08) };
        if (Platform.OS === 'web') {
          return <Text key={i} style={[line, style, { color: last ? '#fff' : 'rgba(255,255,255,0.6)' }]}>{l}</Text>;
        }
        return (
          <MaskedView key={i} style={style} maskElement={<Text style={line}>{l}</Text>}>
            {/* невидимая копия задаёт маске ширину, иначе она схлопывается в ноль */}
            <Text style={[line, { opacity: 0 }]}>{l}</Text>
            <LinearGradient
              colors={last ? ['#fff', 'rgba(255,255,255,0.86)'] : ['#fff', 'rgba(255,255,255,0.12)']}
              locations={last ? [0.4, 1] : [0.25, 0.9]}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        );
      })}
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
  const stretch = scrollY.interpolate({ inputRange: [-height, 0], outputRange: [1.8, 1], extrapolateRight: 'clamp' });
  const parallax = scrollY.interpolate({ inputRange: [0, height], outputRange: [0, height * 0.35], extrapolateLeft: 'clamp' });
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
  const titleSize = Math.max(36, Math.min(50, Math.round(width * 0.118)));
  const photo = slide.kind === 'welcome' ? slide.photo : slide.item.photo;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: parallax }, { scale: stretch }] }]}>
        <Reanimated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
          <Photo source={pic(photo)} style={StyleSheet.absoluteFill} transition={300} />
        </Reanimated.View>
      </Animated.View>
      {/* ровное затемнение под текст по центру + сверху под шапку + снизу под кнопку */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
      <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']} locations={[0, 0.2]} style={StyleSheet.absoluteFill} />
      {/* верх кадра размыт под заголовком и плавно переходит в резкое фото (вариант B) */}
      <ProgressiveBlur top from={0.42} intensity={32} tint="dark" />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)']} locations={[0.65, 1]} style={StyleSheet.absoluteFill} />

      <Animated.View style={[s.center, { opacity: uiOpacity }]} pointerEvents="none">
        {slide.kind === 'welcome' ? (
          <>
            <Logo width={Math.round(width * 0.64)} color="#fff" />
          </>
        ) : (
          <>
            <OverlapTitle text={slide.item.title} size={titleSize} />
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
      <View style={s.brand} pointerEvents="none" accessibilityRole="header">
        <Logo width={92} color={colors.coral} />
      </View>
      <Tap style={s.plainPoints} onPress={() => router.push('/points')} accessibilityRole="button" accessibilityLabel={`${points} пиков, подробнее`}>
        <AnimatedNumber value={points} format={String} style={[s.pointsText, { color: colors.fg }]} />
        <Pik />
      </Tap>
    </View>
  );
}

/* ====================================================================== */
/*  Плитки-действия                                                        */
/* ====================================================================== */

/*
 * Система плиток (одна на всю главную):
 *  • сетка: 2 колонки, зазор 10; малая плитка — 116, большая — 2 малые + зазор, широкая — на всю ширину;
 *  • структура: сверху слева — иконка в круге 36, справа — метка; снизу — заголовок (Unbounded) и подпись (Inter);
 *  • поверхность по роли: peach — действие, photo — продукт, plain — статус.
 */
const TILE_S = 116;
const TILE_GAP = 10;
const TILE_L = TILE_S * 2 + TILE_GAP;

type Surface = 'peach' | 'photo' | 'plain';

function TileIcon({ surface, children }: { surface: Surface; children: ReactNode }) {
  if (surface === 'photo') {
    return <Glass tone="dark" style={s.tIcon}>{children}</Glass>;
  }
  return <View style={[s.tIcon, { backgroundColor: surface === 'peach' ? '#fff' : colors.peach }]}>{children}</View>;
}

function Tile({
  surface,
  icon,
  title,
  sub,
  size = 'S',
  photo,
  onPress,
  label,
  children,
}: {
  surface: Surface;
  icon: ReactNode;
  title: string;
  sub?: string;
  size?: 'S' | 'L' | 'W';
  photo?: number;
  onPress?: () => void;
  label?: string;
  children?: ReactNode;
}) {
  const onPhoto = surface === 'photo';
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? [title, sub].filter(Boolean).join(', ')}
      style={[
        s.tile,
        s.clear,
        size === 'S' && { height: TILE_S },
        size === 'L' && { height: TILE_L },
        size === 'W' && { minHeight: TILE_S },
        size !== 'W' && { flex: 1 },
      ]}>
      {onPhoto && photo ? (
        <>
          <Photo source={photo} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        </>
      ) : <TileBg kind={surface === 'peach' ? 'peach' : 'plain'} />}
      <TileIcon surface={surface}>{icon}</TileIcon>
      <View style={{ flex: 1, minHeight: 8 }} />
      <Text style={[size === 'S' ? s.tTitleS : s.tTitleL, onPhoto && { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{title}</Text>
      {sub ? <Text style={[s.tSub, onPhoto && { color: 'rgba(255,255,255,0.85)' }]} numberOfLines={1}>{sub}</Text> : null}
      {children}
    </Tap>
  );
}

/** Поверхность плитки: ровная заливка одним спокойным тоном, без стекла и объёма. */
function TileBg(_: { kind: 'peach' | 'teal' | 'plain' | 'coral' }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />;
}

/** «Общий альбом»: стопка лиц — сразу видно, что альбом на компанию. */
const FACES = ['friends-selfie', 'friends-night', 'birthday-cake'] as const;
function SharedTile() {
  return (
    <Tap style={[s.tile, s.shared]} onPress={() => router.push('/shared')} accessibilityRole="button" accessibilityLabel="Общий альбом, гости добавляют фото по QR-коду">
      <TileBg kind="teal" />
      <View style={s.faces}>
        {FACES.map((k, i) => (
          <Photo key={k} source={pic(k)} style={[s.face, { marginLeft: i === 0 ? 0 : -10, zIndex: FACES.length - i }]} />
        ))}
        <View style={[s.face, s.faceMore]}>
          <QrCodeIcon size={14} color={colors.peachInk} weight="bold" />
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <Text style={s.tTitleS} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Общий альбом</Text>
      <Text style={s.tSub} numberOfLines={1}>гости по QR-коду</Text>
    </Tap>
  );
}

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
  const iconPeach = colors.peachInk;
  return (
    <View style={{ gap: TILE_GAP }}>
      {/* действие: собрать книгу */}
      <View style={[s.tile, s.clear, { gap: 12 }]}>
        <TileBg kind="peach" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TileIcon surface="peach"><BookOpenTextIcon size={19} color={iconPeach} weight="fill" /></TileIcon>
          <View style={{ flex: 1 }}>
            <Text style={s.tTitleL}>Собрать книгу</Text>
            <Text style={s.tSub}>Опишите словами или скажите голосом</Text>
          </View>
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

      <View style={{ flexDirection: 'row', gap: TILE_GAP }}>
        {/* продукт: фотопечать */}
        <Tile
          surface="photo"
          size="L"
          photo={photos['cafe-dessert']}
          icon={<ImagesIcon size={18} color="#fff" weight="fill" />}
          title="Фотопечать"
          onPress={() => router.push('/print')}
          sub={`${tiles.printFrom} за снимок`}
        />
        <View style={{ flex: 1, gap: TILE_GAP }}>
          {/* действия */}
          <SharedTile />
          <Tile
            surface="plain"
            icon={<MagicWandIcon size={18} color={colors.peachInk} weight="fill" />}
            title="Обработать фото"
            sub="свет, цвет, ретушь"
            onPress={() => router.push('/retouch')}
          />
        </View>
      </View>

      {/* статус: текущий заказ */}
      <Tile
        surface="plain"
        size="W"
        onPress={onOrder}
        label={`${order.title}, ${order.when}`}
        icon={<Photo source={photos.bouquet} style={s.tIconPhoto} />}
        title={order.title}
        sub={`Будет ${order.when}`}>
        <View style={{ marginTop: 10 }}>
          <SegmentBar total={STAGES.length} done={STAGES.indexOf(order.stage)} />
        </View>
      </Tile>
    </View>
  );
}

/* ====================================================================== */
/*  «Мои альбомы» как в Panora                                             */
/* ====================================================================== */

export function AlbumCards({ items }: { items: Album[] }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Мои альбомы" />
      <View style={{ gap: 8 }}>
        {items.map((a) => (
          <Tap key={a.id} style={s.album} onPress={() => router.push({ pathname: '/book/[id]', params: { id: a.id } })} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.subtitle}`}>
            <Photo source={pic(a.photo)} style={StyleSheet.absoluteFill} transition={250} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
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
              <View style={s.albumTitleWrap}><Text style={[s.albumTitle, { color: 'rgba(255,255,255,0.88)' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{a.title}</Text></View>
            ) : (
              <MaskedView
                style={s.albumTitleWrap}
                maskElement={
                  <View style={s.albumMask}>
                    <Text style={s.albumTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{a.title}</Text>
                  </View>
                }>
                {/* стекло: размытое фото под буквами, белый налёт и блик сверху */}
                <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
                <LinearGradient colors={['rgba(255,255,255,0.92)', 'rgba(255,255,255,0.6)']} locations={[0.35, 0.75]} style={StyleSheet.absoluteFill} />
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
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 320 },
  /* слайды */
  top: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, marginRight: 12 },
  whoTitle: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  whoSub: { fontSize: 12.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontFamily: fonts.bold, color: '#fff' },
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: -1 },
  points: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 12, paddingRight: 6, borderRadius: 16 },
  pointsText: { fontSize: 15, fontFamily: fonts.bold, color: '#fff', fontVariant: ['tabular-nums'] },

  center: { position: 'absolute', left: 0, right: 0, top: 136, alignItems: 'center', paddingHorizontal: 22, gap: 8 },
  kicker: { fontSize: 17, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.88)', letterSpacing: 0.1 },
  title: { fontSize: 44, lineHeight: 50, fontFamily: fonts.display, letterSpacing: -1.2, color: '#fff' },
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
  tile: {
    borderRadius: 26,
    backgroundColor: colors.card,
    padding: 16,
    overflow: 'hidden',
  },
  tIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tIconPhoto: { width: 36, height: 36 },
  clear: { backgroundColor: 'transparent' },
  shared: { flex: 1, height: TILE_S, backgroundColor: 'transparent' },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', overflow: 'hidden' },
  faceMore: { marginLeft: -10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tTitleS: { fontSize: 16, lineHeight: 19, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  tTitleL: { fontSize: 21, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },
  tSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 3 },
  field: { height: 54, borderRadius: 18, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  fieldTap: { flex: 1, height: '100%', justifyContent: 'center', paddingLeft: 16 },
  fieldText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.mut },
  mic: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },

  /* альбомы */
  album: { height: 200, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card2 },
  albumTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  albumBadge: { height: 28, paddingHorizontal: 11, borderRadius: 14, justifyContent: 'center' },
  more: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  albumTitleWrap: { position: 'absolute', left: 16, right: 16, bottom: 4, height: 72, justifyContent: 'flex-end' },
  albumMask: { flex: 1, justifyContent: 'flex-end' },
  albumTitle: { fontSize: 58, lineHeight: 70, fontFamily: fonts.display, letterSpacing: -1.5, color: '#000', textAlign: 'center' },
});
