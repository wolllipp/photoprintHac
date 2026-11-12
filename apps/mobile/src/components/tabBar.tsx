/**
 * Нижнее меню: три кнопки — Главная · Черновики · Заказы. Меню «воздушное»: висит над экраном,
 * без сплошной полосы; каждая кнопка — отдельный квадратик со скруглением, как в Pinterest.
 * Кнопки — стеклянные квадратики с мягкой тенью. Выбранная плавно заливается коралловым, значок белый;
 * остальные — тёмный контурный значок.
 * У «Черновиков» — число начатых книг. «Создать» — плюсом на главной, профиль — аватаром в шапке.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { BookOpenIcon, HouseSimpleIcon, PackageIcon } from 'phosphor-react-native';
import { useRef, useState, type ComponentType } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { setPendingBook } from '@/api/book';
import { dupText, pickPhotos } from '@/data/picked';
import { NewSheet, type NewChoice } from '@/components/newSheet';
import { Tap } from '@/components/ui';
import { BOOK, drafts, fitPages } from '@/data/demo';
import { useStore } from '@/data/store';
import { SHEET_TAIL, sheetIn, sheetOut } from '@/motion';
import { colors, fonts } from '@/theme';

type IconProps = { size: number; color: string; weight: 'regular' | 'fill' };
const ICONS: Record<string, { Icon: ComponentType<IconProps>; label: string }> = {
  index: { Icon: HouseSimpleIcon, label: 'Главная' },
  drafts: { Icon: BookOpenIcon, label: 'Черновики' },
  orders: { Icon: PackageIcon, label: 'Заказы' },
};
const BTN = 58;

export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { tabBarHidden, started, hiddenDrafts, serverDrafts } = useStore();
  const draftsCount = Object.keys(started).filter((id) => !hiddenDrafts.includes(id) && (drafts[id] || serverDrafts[id])).length;
  if (tabBarHidden) return null;
  return (
    <>
    {/* под меню контент мягко растворяется в белый — кнопки читаются на любом фоне, а меню остаётся «воздушным» */}
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', '#fff']}
      locations={[0, 0.55, 1]}
      style={[s.fade, { height: insets.bottom + 110 }]}
    />
    <View style={[s.bar, { bottom: Math.max(insets.bottom - 4, 12) }]} pointerEvents="box-none">
      {state.routes.map((route, index) => {
        const item = ICONS[route.name];
        if (!item) return null;
        const focused = index === state.index;
        const onPress = () => {
          Haptics.selectionAsync().catch(() => {});
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <TabButton key={route.key} focused={focused} label={item.label} onPress={onPress} badge={route.name === 'drafts' ? draftsCount : 0} Icon={item.Icon} />
        );
      })}
    </View>
    </>
  );
}

function TabButton({ focused, label, onPress, badge, Icon }: { focused: boolean; label: string; onPress: () => void; badge: number; Icon: ComponentType<IconProps> }) {
  // выбранная: коралловая заливка просто плавно проявляется — без прыжков и масштаба
  const fill = useAnimatedStyle(() => ({ opacity: withTiming(focused ? 1 : 0, { duration: 160 }) }));
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={badge ? `${label}, ${badge}` : label} hitSlop={4}>
      <View style={s.btnShadow}>
        {/* матовое стекло без светлой кромки — на тёмном фоне не даёт белой обводки */}
        <View style={s.btn}>
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, s.btnFrost]} />
          <Animated.View style={[StyleSheet.absoluteFill, s.btnOn, fill]} />
          <Icon size={25} color={focused ? '#fff' : colors.fg} weight={focused ? 'fill' : 'regular'} />
        </View>
      </View>
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Самая маленькая книга — Lite на 24 страницы; на каждую страницу нужно хотя бы одно фото. */
const MIN_PHOTOS = BOOK.lite.min;

/**
 * Книга из фото: выбрали в галерее — сразу собираем; объём по числу снимков (в среднем 1–2 на страницу).
 * Фото меньше 24 — честно говорим: книга не может быть меньше 24 страниц. Можно добрать фото или напечатать эти как фотографии.
 */
async function bookFromPhotos(have: string[] = [], onShort?: (uris: string[], dup: number) => void) {
  // уже выбранные снимки повторно не добавляем, даже если их снова отметили в галерее
  const picked = await pickPhotos(have);
  if (!picked) return;
  const uris = [...have, ...picked.fresh];
  const n = uris.length;
  if (n < MIN_PHOTOS) {
    onShort?.(uris, picked.dup);
    return;
  }
  const pages = fitPages('lite', Math.round(n / 1.6));
  // выбранные фото — экрану сборки: он загрузит их на сервер и соберёт книгу по-настоящему
  setPendingBook({ uris, title: 'Новая книга', pages });
  router.push({ pathname: '/build', params: { title: 'Новая книга', photos: String(n), pages: String(pages) } });
}

/** Печать: сначала выбираем фото в галерее, потом — формат, бумага и копии. */
async function printFromPhotos() {
  const picked = await pickPhotos([]);
  if (!picked) return;
  router.push({ pathname: '/print', params: { photos: JSON.stringify(picked.fresh) } });
}

/** Лист «Создать» — один на все вкладки: открывается и «+» в меню, и кружком на главной. */
export function CreateHost() {
  const { creating, setCreating } = useStore();
  // фото для книги мало — своё окно в стиле приложения (а не системное)
  const [short, setShortState] = useState<{ uris: string[]; dup: number } | null>(null);
  const setShort = (uris: string[] | null, dup = 0) => setShortState(uris ? { uris, dup } : null);
  // галерею открываем, только когда лист закрылся полностью: iOS молча не покажет второе окно поверх закрывающегося
  const wantGallery = useRef<'book' | 'print' | null>(null);
  const openGallery = () => {
    const want = wantGallery.current;
    if (!want) return;
    wantGallery.current = null;
    (want === 'book' ? bookFromPhotos([], setShort) : printFromPhotos()).catch(() => {});
  };
  const onPick = (c: NewChoice) => {
    setCreating(false);
    // книга и печать начинаются с выбора фото в галерее
    if (c === 'photos' || c === 'print') {
      wantGallery.current = c === 'photos' ? 'book' : 'print';
      // на Android у Modal нет onDismiss — ждём, пока закончится анимация закрытия
      if (Platform.OS !== 'ios') setTimeout(openGallery, 400);
    } else if (c === 'words') router.push('/story');
    else if (c === 'voice') router.push({ pathname: '/story', params: { voice: '1' } });
    else router.push('/shared');
  };
  return (
    <>
      <NewSheet visible={creating} onClose={() => setCreating(false)} onPick={onPick} onDismissed={openGallery} />
      {short ? (
        <ShortSheet
          uris={short.uris}
          dup={short.dup}
          onAdd={() => {
            const have = short.uris;
            setShort(null);
            bookFromPhotos(have, setShort).catch(() => {});
          }}
          onPrint={() => {
            const have = short.uris;
            setShort(null);
            router.push({ pathname: '/print', params: { photos: JSON.stringify(have) } });
          }}
          onClose={() => setShort(null)}
        />
      ) : null}
    </>
  );
}

/**
 * «Нужно больше фото» — в стиле приложения: лист снизу, полоса «10 из 24», выбранные фото,
 * главное действие — добрать фото; запасное — напечатать эти как фотографии.
 */
function ShortSheet({ uris, dup, onAdd, onPrint, onClose }: { uris: string[]; dup: number; onAdd: () => void; onPrint: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const n = uris.length;
  const need = MIN_PHOTOS - n;
  const shown = uris.slice(0, 5);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(240)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
        <View style={s.grab} />
        <Text style={s.title}>Нужно больше фото</Text>
        <Text style={s.text}>Самая маленькая книга — {MIN_PHOTOS} страницы, на каждую нужно хотя бы одно фото.</Text>
        {dup ? <Text style={s.dup}>{dupText(dup)}</Text> : null}

        {/* сколько есть и сколько нужно */}
        <View style={{ gap: 8 }}>
          <View style={s.countRow}>
            <Text style={s.count}>
              {n} <Text style={s.countOf}>из {MIN_PHOTOS} фото</Text>
            </Text>
            <Text style={s.need}>ещё {need}</Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${(n / MIN_PHOTOS) * 100}%` }]} />
          </View>
        </View>

        <View style={s.thumbs}>
          {shown.map((u) => (
            <Image key={u} source={{ uri: u }} style={s.thumb} contentFit="cover" />
          ))}
          {n > shown.length ? (
            <View style={[s.thumb, s.more]}>
              <Text style={s.moreText}>+{n - shown.length}</Text>
            </View>
          ) : null}
        </View>

        <Tap style={s.primary} onPress={onAdd} accessibilityRole="button">
          <Text style={s.primaryText}>Добавить ещё {need} фото</Text>
        </Tap>
        <Tap style={s.secondary} onPress={onPrint} accessibilityRole="button">
          <Text style={s.secondaryText}>Напечатать эти как фото</Text>
        </Tap>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  btnShadow: { borderRadius: 20, boxShadow: '0 8px 22px rgba(40,28,20,0.16)' },
  btn: { width: BTN, height: BTN, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btnFrost: { backgroundColor: 'rgba(255,255,255,0.9)' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  btnOn: { backgroundColor: colors.coralAction, borderRadius: 20 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: 2, borderColor: colors.bg, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 8, gap: 14 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  text: { fontSize: 15, lineHeight: 21, fontFamily: fonts.medium, color: colors.mut, marginTop: -6 },
  dup: { fontSize: 14, lineHeight: 19, fontFamily: fonts.semibold, color: colors.peachInk, backgroundColor: colors.peach, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden', marginTop: -4 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  count: { fontSize: 22, fontFamily: fonts.display, color: colors.fg, fontVariant: ['tabular-nums'] },
  countOf: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  need: { fontSize: 14, fontFamily: fonts.semibold, color: colors.coralAction },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.card, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.coralAction },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.card2 },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  moreText: { fontSize: 14, fontFamily: fonts.bold, color: colors.mut },
  primary: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  secondary: { height: 50, borderRadius: 25, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginTop: -4 },
  secondaryText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  badgeText: { fontSize: 10.5, fontFamily: fonts.bold, color: '#fff' },
});
