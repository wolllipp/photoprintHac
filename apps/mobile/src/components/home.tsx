/**
 * Главная: сверху ряд кружков (плюс «Создать» и готовые подборки, как истории), ниже —
 * «Продолжить книгу» и статус заказа. Незаконченные книги живут в разделе «Черновики», а не здесь. Полноэкранного приветствия больше нет:
 * подборки открываются на весь экран по нажатию на кружок (components/picks.tsx).
 * Правила: стекло только поверх фото; коралловый — только главное действие; белая основа, персиковый — акцент.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { DotsThreeIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, { Easing, FadeInDown } from 'react-native-reanimated';

import { BlurView } from 'expo-blur';

import { Glass, MaskedView } from '@/components/glass';
import { Logo } from '@/components/logo';
import { Pik, SectionHeader, SegmentBar, Tap } from '@/components/ui';
import { useStore } from '@/data/store';
import { STAGES, type Album, type CurrentOrder, type Suggestion } from '@/data/demo';
import { photos, pic } from '@/data/photos';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

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

/**
 * rgb — цвет букв «r,g,b»: белый на фото, тёмный на светлом фоне.
 * warm — коралловый наплыв: верхняя строка тает книзу в персиковый, нижняя — сплошным коралловым поверх.
 * enter — строки мягко поднимаются по очереди при появлении.
 * maxWidth — если строка на этом телефоне шире, заголовок сам уменьшается (замер после отрисовки).
 */
export function OverlapTitle({
  text,
  size: wanted,
  rgb = '255,255,255',
  warm,
  enter,
  maxWidth,
}: {
  text: string;
  size: number;
  rgb?: string;
  warm?: boolean;
  enter?: boolean;
  maxWidth?: number;
}) {
  const [fit, setFit] = useState<number | null>(null);
  const size = fit ?? wanted;
  const lines = splitLines(text);
  const lh = Math.round(size * 0.8); // строки наезжают
  // запас по краям: из-за отрицательного интервала последняя буква шире своей строки, а маска на iOS режет по строке
  const line = { fontSize: size, lineHeight: Math.round(size * 1.08), fontFamily: fonts.overlap, letterSpacing: -size * 0.04, color: '#000', textAlign: 'center', paddingHorizontal: Math.round(size * 0.1) } as const;
  // ширина строки на самом деле: если не влезает — уменьшаем кегль пропорционально (один раз)
  const measure = (w: number) => {
    if (!maxWidth || fit !== null) return;
    setFit(w <= maxWidth ? wanted : Math.floor((wanted * maxWidth) / w));
  };
  const top = warm ? (['rgba(204,96,91,1)', 'rgba(208,108,98,0.9)', 'rgba(220,140,124,0.62)'] as const) : ([`rgb(${rgb})`, `rgba(${rgb},0.12)`] as const);
  const topAt = warm ? ([0.15, 0.6, 1] as const) : ([0.25, 0.9] as const);
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (
    <View accessibilityRole="header" accessibilityLabel={text} style={{ alignItems: 'center' }}>
      {/* невидимый замер: строка в своей естественной ширине, без переноса */}
      {maxWidth && fit === null ? (
        <View style={{ position: 'absolute', top: 0, left: 0, width: 4000, opacity: 0 }} pointerEvents="none">
          <Text style={[line, { alignSelf: 'flex-start' }]} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
            {longest}
          </Text>
        </View>
      ) : null}
      {/* пока не замерили — не рисуем, чтобы не мелькнул слишком крупный заголовок */}
      {maxWidth && fit === null ? null : lines.map((l, i) => {
        const last = i === lines.length - 1;
        const style = { height: Math.round(size * 1.08), marginTop: i === 0 ? 0 : lh - Math.round(size * 1.08) };
        const entering = enter ? FadeInDown.delay(i * 110).duration(520).easing(Easing.out(Easing.cubic)) : undefined;
        if (Platform.OS === 'web' || last) {
          // нижняя строка — сплошная (поверх верхней); в браузере маски нет — верхняя просто полупрозрачная
          return (
            <Reanimated.View key={i} entering={entering} style={{ zIndex: last ? 2 : 1 }}>
              <Text style={[line, style, { color: last ? (warm ? colors.coralAction : `rgb(${rgb})`) : warm ? 'rgba(214,122,108,0.9)' : `rgba(${rgb},0.6)` }]}>
                {l}
              </Text>
            </Reanimated.View>
          );
        }
        return (
          <Reanimated.View key={i} entering={entering} style={{ zIndex: 1 }}>
            <MaskedView style={style} maskElement={<Text style={line}>{l}</Text>}>
              {/* невидимая копия задаёт маске ширину, иначе она схлопывается в ноль */}
              <Text style={[line, { opacity: 0 }]}>{l}</Text>
              <LinearGradient colors={top} locations={topAt} style={StyleSheet.absoluteFill} />
            </MaskedView>
            {/* нижняя часть верхней строки не только бледнеет, но и расплывается под нижней */}
            {warm ? (
              <MaskedView
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                maskElement={<LinearGradient colors={['transparent', 'black']} locations={[0.35, 0.9]} style={StyleSheet.absoluteFill} />}>
                <BlurView intensity={16} tint="default" style={StyleSheet.absoluteFill} />
              </MaskedView>
            ) : null}
          </Reanimated.View>
        );
      })}
    </View>
  );
}

/* ====================================================================== */
/*  Шапка: аватар · логотип · пики                                         */
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
/*  Кружки сверху: плюс и подборки, как истории                            */
/* ====================================================================== */

const RING = 72;

/**
 * Первый кружок — плюс «Создать». Дальше — книги, которые уже собраны из фото:
 * коралловое кольцо — ещё не смотрели, серое — смотрели. Нажатие открывает подборку на весь экран.
 */
export function StoryRow({ items, seen, onNew, onOpen }: { items: Suggestion[]; seen: string[]; onNew: () => void; onOpen: (index: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rowBleed} contentContainerStyle={s.row}>
      <Tap style={s.ringItem} onPress={onNew} accessibilityRole="button" accessibilityLabel="Создать: книгу, печать фото или общий альбом">
        <View style={[s.ring, s.ringNew]}>
          <PlusIcon size={28} color="#fff" weight="bold" />
        </View>
        <Text style={[s.ringLabel, { color: colors.fg, fontFamily: fonts.semibold }]} numberOfLines={1}>Создать</Text>
      </Tap>
      {items.map((it, i) => {
        const old = seen.includes(it.id);
        return (
          <Tap key={it.id} style={s.ringItem} onPress={() => onOpen(i)} accessibilityRole="button" accessibilityLabel={`${it.title}, ${it.meta}${old ? ', просмотрено' : ''}`}>
            <LinearGradient colors={old ? [colors.card2, colors.card2] : [colors.coral, '#E9A27F']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.ring}>
              <View style={s.ringGap}>
                <Photo source={pic(it.photo)} style={s.ringPhoto} />
              </View>
            </LinearGradient>
            <Text style={[s.ringLabel, old && { color: colors.mut }]} numberOfLines={1}>{it.title}</Text>
          </Tap>
        );
      })}
    </ScrollView>
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

/** Под кружками: «Продолжить книгу» (если бросили на полпути) и статус текущего заказа. */
export function HomeStatus({ order, onOrder }: { order: CurrentOrder; onOrder: () => void }) {
  const { lastBook, setLastBook } = useStore();
  return (
    <View style={{ gap: TILE_GAP }}>
      {/* брошенная сборка: вернуться одним касанием на то же место (A11) */}
      {lastBook ? (
        <Reanimated.View entering={FadeInDown.duration(380)} style={[s.tile, s.resume]}>
          <Photo source={photos[lastBook.cover as keyof typeof photos] ?? photos['night-window']} style={s.resumeCover} />
          <View style={{ flex: 1 }}>
            <Text style={s.resumeLabel}>Продолжить книгу</Text>
            <Text style={s.resumeTitle} numberOfLines={1}>{lastBook.title}</Text>
            <Text style={s.tSub} numberOfLines={1}>собрана · храним 60 дней</Text>
          </View>
          <Tap style={s.resumeBtn} onPress={() => router.push({ pathname: '/preview', params: lastBook.params })} accessibilityRole="button" accessibilityLabel={`Продолжить книгу «${lastBook.title}»`}>
            <Text style={s.resumeBtnText}>Открыть</Text>
          </Tap>
          <Tap style={s.resumeX} onPress={() => setLastBook(null)} accessibilityRole="button" accessibilityLabel="Скрыть" hitSlop={10}>
            <XIcon size={13} color={colors.mut} weight="bold" />
          </Tap>
        </Reanimated.View>
      ) : null}

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
/*  «Черновики» — незаконченные книги                                      */
/* ====================================================================== */

export function AlbumCards({ items }: { items: Album[] }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Черновики" />
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
  brand: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: -1 },
  pointsText: { fontSize: 15, fontFamily: fonts.bold, color: '#fff', fontVariant: ['tabular-nums'] },

  /* кружки */
  rowBleed: { marginHorizontal: -16 },
  row: { paddingHorizontal: 16, gap: 12 },
  ringItem: { width: RING + 6, alignItems: 'center', gap: 6 },
  ring: { width: RING, height: RING, borderRadius: RING / 2, alignItems: 'center', justifyContent: 'center' },
  ringNew: { backgroundColor: colors.coralAction },
  ringGap: { width: RING - 6, height: RING - 6, borderRadius: (RING - 6) / 2, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  ringPhoto: { width: RING - 12, height: RING - 12, borderRadius: (RING - 12) / 2 },
  ringLabel: { fontSize: 12, lineHeight: 15, fontFamily: fonts.medium, color: colors.fg, maxWidth: RING + 6, textAlign: 'center' },

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
  resume: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.peach, paddingVertical: 12, paddingRight: 34 },
  resumeCover: { width: 52, height: 60, borderRadius: 12 },
  resumeLabel: { fontSize: 12, fontFamily: fonts.bold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.peachInk },
  resumeTitle: { fontSize: 18, lineHeight: 23, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  resumeBtn: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.coralAction, justifyContent: 'center' },
  resumeBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  resumeX: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  tTitleS: { fontSize: 16, lineHeight: 19, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  tTitleL: { fontSize: 21, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },
  tSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 3 },
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
