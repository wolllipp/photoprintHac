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
import { ConsentSheet } from '@/components/consent';
import { pickPhotos, skipText } from '@/data/picked';
import { NewSheet, type NewChoice } from '@/components/newSheet';
import { Tap } from '@/components/ui';
import { BOOK, bookPrice, drafts, fitPages, tariffs } from '@/data/demo';
import { rub, useStore } from '@/data/store';
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

/** Книга по умолчанию — Lite (минимум 24 страницы). Самая маленькая книга — Premium на 10 страниц. */
const MIN_PHOTOS = BOOK.premium.min;
/** Коллаж — в среднем 2,5 фото на страницу; «хватает на коллажи» — хотя бы 2 фото на каждую страницу минимума. */
const PER_PAGE = 2.5;
const collageNeed = (t: BookTariff) => BOOK[t].min * 2;
export type BookTariff = 'lite' | 'classic' | 'premium';

/**
 * Тариф, на котором из n фото выйдут коллажи: Lite, если фото хватает; иначе тариф с меньшим минимумом страниц;
 * совсем мало — самый маленький (Premium, по одному фото). null — меньше 10 фото, книгу не собрать.
 */
export function collageTariff(n: number): BookTariff | null {
  if (n >= collageNeed('lite')) return 'lite';
  if (n >= collageNeed('classic')) return 'classic';
  if (n >= collageNeed('premium')) return 'premium';
  return n >= MIN_PHOTOS ? 'premium' : null;
}

/** Собрать книгу из этих фото на этом тарифе: объём — по числу снимков (коллажи), не меньше минимума тарифа. */
export function startBook(uris: string[], tariff: BookTariff, title = 'Новая книга') {
  const n = uris.length;
  const pages = fitPages(tariff, Math.round(n / PER_PAGE));
  // выбранные фото ждут экрана сборки: сначала четыре вопроса (какие фото, размер, фон, украшения — app/options.tsx),
  // потом экран сборки загрузит их на сервер и соберёт книгу по-настоящему
  setPendingBook({ uris, title, pages, tariff });
  router.push({ pathname: '/options', params: { title, photos: String(n), pages: String(pages), tariff } });
}

/**
 * Книга из фото: выбрали в галерее — собираем коллажами (2–4 фото на странице).
 * Фото не хватает на коллажи в Lite (у него минимум 24 страницы) — честно говорим и даём выбор:
 * добавить фото, собрать на тарифе с меньшим минимумом (коллажи сразу) или собрать как есть.
 */
async function bookFromPhotos(have: string[] = [], onShort?: (uris: string[], skipped: string | null) => void) {
  // уже выбранные снимки повторно не добавляем, даже если их снова отметили в галерее
  const picked = await pickPhotos(have);
  if (!picked) return;
  const uris = [...have, ...picked.fresh];
  if (uris.length < collageNeed('lite')) {
    onShort?.(uris, skipText(picked));
    return;
  }
  startBook(uris, 'lite');
}

/** Печать: сначала выбираем фото в галерее, потом — формат, бумага и копии. */
async function printFromPhotos() {
  const picked = await pickPhotos([]);
  if (!picked) return;
  router.push({ pathname: '/print', params: { photos: JSON.stringify(picked.fresh) } });
}

/** Лист «Создать» — один на все вкладки: открывается и «+» в меню, и кружком на главной. */
export function CreateHost() {
  const { creating, setCreating, aiConsent, setAiConsent } = useStore();
  // перед первой загрузкой фото на любом пути — согласие на обработку ИИ (план 1.15), один раз.
  // ask — какой путь ждёт согласия; after — куда идти, когда лист согласия закроется
  const [ask, setAsk] = useState<NewChoice | null>(null);
  const wantConsent = useRef<NewChoice | null>(null);
  const after = useRef<NewChoice | null>(null);
  // фото для книги мало — своё окно в стиле приложения (а не системное)
  const [short, setShortState] = useState<{ uris: string[]; skipped: string | null } | null>(null);
  const setShort = (uris: string[] | null, skipped: string | null = null) => setShortState(uris ? { uris, skipped } : null);
  // галерею открываем, только когда лист закрылся полностью: iOS молча не покажет второе окно поверх закрывающегося
  const wantGallery = useRef<'book' | 'print' | null>(null);
  const openGallery = () => {
    const want = wantGallery.current;
    if (!want) return;
    wantGallery.current = null;
    (want === 'book' ? bookFromPhotos([], setShort) : printFromPhotos()).catch(() => {});
  };
  // путь выбран и согласие есть: книга и печать начинаются с выбора фото в галерее
  const go = (c: NewChoice) => {
    if (c === 'photos' || c === 'print') {
      wantGallery.current = c === 'photos' ? 'book' : 'print';
      // на Android у Modal нет onDismiss — ждём, пока закончится анимация закрытия
      if (Platform.OS !== 'ios') setTimeout(openGallery, 400);
    } else if (c === 'words') router.push('/story');
    else if (c === 'voice') router.push({ pathname: '/story', params: { voice: '1' } });
    else router.push('/shared');
  };
  // «По описанию» спрашивает согласие на своём экране; книга из фото, печать и общий альбом — здесь
  const needsConsent = (c: NewChoice) => !aiConsent && (c === 'photos' || c === 'print' || c === 'shared');
  const onPick = (c: NewChoice) => {
    setCreating(false);
    if (needsConsent(c)) {
      // лист согласия — когда закроется лист «Создать» (два окна сразу iOS не покажет)
      wantConsent.current = c;
      if (Platform.OS !== 'ios') setTimeout(onSheetGone, 400);
      return;
    }
    go(c);
  };
  const onSheetGone = () => {
    const c = wantConsent.current;
    wantConsent.current = null;
    if (c) setAsk(c);
    else openGallery();
  };
  // согласие закрылось: после «Согласен» продолжаем выбранный путь
  const onConsentGone = () => {
    const c = after.current;
    after.current = null;
    if (!c) return;
    go(c);
    if (Platform.OS === 'ios') openGallery();
  };
  return (
    <>
      <NewSheet visible={creating} onClose={() => setCreating(false)} onPick={onPick} onDismissed={onSheetGone} />
      <ConsentSheet
        visible={!!ask}
        cta={ask === 'shared' ? 'Согласен, создать альбом' : ask === 'print' ? 'Согласен, выбрать фото' : 'Согласен, собрать книгу'}
        onClose={() => setAsk(null)}
        onAccept={() => {
          setAiConsent(true);
          after.current = ask;
          setAsk(null);
          if (Platform.OS !== 'ios') setTimeout(onConsentGone, 400);
        }}
        onDismissed={onConsentGone}
      />
      {short ? (
        <ShortSheet
          uris={short.uris}
          skipped={short.skipped}
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
          onBuild={(t) => {
            const have = short.uris;
            setShort(null);
            startBook(have, t);
          }}
          onClose={() => setShort(null)}
        />
      ) : null}
    </>
  );
}

/**
 * «Мало фото для коллажей» — лист снизу, полоса «25 из 48», выбранные фото. Главное — добрать фото;
 * дальше — собрать на тарифе с меньшим минимумом (коллажи сразу, другая цена) или как есть; запасное — напечатать как фото.
 */
function ShortSheet({ uris, skipped, onAdd, onPrint, onBuild, onClose }: { uris: string[]; skipped: string | null; onAdd: () => void; onPrint: () => void; onBuild: (t: BookTariff) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const n = uris.length;
  const goal = collageNeed('lite');
  const need = goal - n;
  const shown = uris.slice(0, 5);
  // тариф, на котором из этих фото уже выйдут коллажи (меньше минимум страниц), и можно ли собрать хоть как-то
  const collageTariff: BookTariff | null = n >= collageNeed('classic') ? 'classic' : n >= collageNeed('premium') ? 'premium' : null;
  const offer = (t: BookTariff) => {
    const pages = fitPages(t, Math.round(n / PER_PAGE));
    return { pages, price: bookPrice(t, '20×20', pages), name: tariffs.find((x) => x.id === t)?.name ?? t };
  };
  const alt = collageTariff ? offer(collageTariff) : null;
  const asIs: BookTariff | null = n >= BOOK.lite.min ? 'lite' : n >= MIN_PHOTOS ? 'premium' : null;
  const asIsOffer = asIs && asIs !== collageTariff ? offer(asIs) : null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(240)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
        <View style={s.grab} />
        <Text style={s.title}>{asIs ? 'Мало фото для коллажей' : 'Нужно больше фото'}</Text>
        <Text style={s.text}>
          {asIs
            ? `В Lite от ${BOOK.lite.min} страниц: чтобы на страницах были коллажи по 2–4 фото, нужно около ${goal} фото.`
            : `Самая маленькая книга — ${MIN_PHOTOS} страниц, на каждую нужно хотя бы одно фото.`}
        </Text>
        {skipped ? <Text style={s.dup}>{skipped}</Text> : null}

        {/* сколько есть и сколько нужно */}
        <View style={{ gap: 8 }}>
          <View style={s.countRow}>
            <Text style={s.count}>
              {n} <Text style={s.countOf}>из {goal} фото</Text>
            </Text>
            <Text style={s.need}>ещё {need}</Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${Math.min(1, n / goal) * 100}%` }]} />
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
        {alt && collageTariff ? (
          <Tap style={s.secondary} onPress={() => onBuild(collageTariff)} accessibilityRole="button" accessibilityLabel={`Собрать на ${alt.name}: коллажи, ${alt.pages} страниц, ${rub(alt.price)}`}>
            <Text style={s.secondaryText}>
              {alt.name}: коллажи, {alt.pages} стр. · {rub(alt.price)}
            </Text>
          </Tap>
        ) : null}
        {asIsOffer && asIs ? (
          <Tap style={s.secondary} onPress={() => onBuild(asIs)} accessibilityRole="button">
            <Text style={s.secondaryText}>
              Собрать как есть: {asIsOffer.name}, {asIsOffer.pages} стр. · {rub(asIsOffer.price)}
            </Text>
          </Tap>
        ) : null}
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
