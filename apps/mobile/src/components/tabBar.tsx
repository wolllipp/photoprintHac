/**
 * Нижнее меню: три кнопки — Главная · Черновики · Заказы. Меню «воздушное»: висит над экраном,
 * без сплошной полосы; каждая кнопка — отдельный квадратик со скруглением, как в Pinterest.
 * Кнопки — стеклянные квадратики с мягкой тенью. Выбранная плавно заливается коралловым, значок белый;
 * остальные — тёмный контурный значок.
 * У «Черновиков» — число начатых книг. «Создать» — плюсом на главной, профиль — аватаром в шапке.
 */
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { BookOpenIcon, HouseSimpleIcon, PackageIcon } from 'phosphor-react-native';
import { useRef, type ComponentType } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { NewSheet, type NewChoice } from '@/components/newSheet';
import { BOOK, fitPages } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

type IconProps = { size: number; color: string; weight: 'regular' | 'fill' };
const ICONS: Record<string, { Icon: ComponentType<IconProps>; label: string }> = {
  index: { Icon: HouseSimpleIcon, label: 'Главная' },
  drafts: { Icon: BookOpenIcon, label: 'Черновики' },
  orders: { Icon: PackageIcon, label: 'Заказы' },
};
const BTN = 58;

export function TabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { tabBarHidden, started, hiddenDrafts } = useStore();
  const draftsCount = Object.keys(started).filter((id) => !hiddenDrafts.includes(id)).length;
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
async function bookFromPhotos(have: string[] = []) {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
  if (res.canceled || !res.assets.length) return;
  const uris = [...have, ...res.assets.map((a) => a.uri).filter((u) => !have.includes(u))];
  const n = uris.length;
  if (n < MIN_PHOTOS) {
    Alert.alert(
      'Нужно больше фото',
      `Самая маленькая книга — ${MIN_PHOTOS} страницы, на каждую нужно хотя бы одно фото. Выбрано ${n} — добавьте ещё ${MIN_PHOTOS - n}.`,
      [
        { text: 'Добавить фото', onPress: () => bookFromPhotos(uris).catch(() => {}) },
        { text: 'Напечатать как фото', onPress: () => router.push({ pathname: '/print', params: { photos: JSON.stringify(uris) } }) },
        { text: 'Отмена', style: 'cancel' },
      ],
    );
    return;
  }
  router.push({ pathname: '/build', params: { title: 'Новая книга', photos: String(n), pages: String(fitPages('lite', Math.round(n / 1.6))) } });
}

/** Печать: сначала выбираем фото в галерее, потом — формат, бумага и копии. */
async function printFromPhotos() {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
  if (res.canceled || !res.assets.length) return;
  router.push({ pathname: '/print', params: { photos: JSON.stringify(res.assets.map((a) => a.uri)) } });
}

/** Лист «Создать» — один на все вкладки: открывается и «+» в меню, и кружком на главной. */
export function CreateHost() {
  const { creating, setCreating } = useStore();
  // галерею открываем, только когда лист закрылся полностью: iOS молча не покажет второе окно поверх закрывающегося
  const wantGallery = useRef<'book' | 'print' | null>(null);
  const openGallery = () => {
    const want = wantGallery.current;
    if (!want) return;
    wantGallery.current = null;
    (want === 'book' ? bookFromPhotos() : printFromPhotos()).catch(() => {});
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
  return <NewSheet visible={creating} onClose={() => setCreating(false)} onPick={onPick} onDismissed={openGallery} />;
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  btnShadow: { borderRadius: 20, boxShadow: '0 8px 22px rgba(40,28,20,0.16)' },
  btn: { width: BTN, height: BTN, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  btnFrost: { backgroundColor: 'rgba(255,255,255,0.9)' },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  btnOn: { backgroundColor: colors.coralAction, borderRadius: 20 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, borderWidth: 2, borderColor: colors.bg, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10.5, fontFamily: fonts.bold, color: '#fff' },
});
