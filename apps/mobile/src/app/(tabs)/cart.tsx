/**
 * Корзина. Каждая позиция — плитка: обложка слева уходит в размытие вправо, справа название,
 * параметры, цена и число экземпляров. Нажатие — править, свайп влево — удалить (с «Вернуть»).
 * Ниже — допуслуги и итог одной строкой в кнопке «Оформить».
 * apple-design: прямое управление (свайп за пальцем), прощение ошибок (вернуть удалённое),
 * отклик сразу (вибрация, пересчёт суммы), пространственная связность (соседи сдвигаются, а не прыгают).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { BookOpenTextIcon, ImagesIcon, MinusIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { cartTotal, EXTRAS, rub, useStore, type CartItem } from '@/data/store';
import { AnimatedNumber, duration, ease, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const layout = LinearTransition.duration(260).easing(ease.smoothOut).reduceMotion(ReduceMotion.System);

export default function Cart() {
  const insets = useSafeAreaInsets();
  const { cart, removeFromCart, restoreToCart, setQty, extras, toggleExtra } = useStore();
  const [undo, setUndo] = useState<{ item: CartItem; index: number } | null>(null);
  const total = cartTotal(cart, extras);
  const pieces = cart.reduce((a, it) => a + it.qty, 0);

  // «Вернуть» живёт 5 секунд
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const remove = (item: CartItem) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setUndo({ item, index: cart.findIndex((x) => x.id === item.id) });
    removeFromCart(item.id);
  };
  const edit = (item: CartItem) =>
    item.tariff === 'print' ? router.push('/print') : router.push({ pathname: '/book/[id]', params: { id: item.projectId } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 120 }]}>
        <View style={s.head}>
          <Text style={s.title}>Корзина</Text>
          {cart.length ? (
            <Animated.Text entering={FadeIn} style={s.count}>
              {pieces} {plural(pieces, 'товар', 'товара', 'товаров')}
            </Animated.Text>
          ) : null}
        </View>

        {cart.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(duration.slow).easing(ease.smoothOut)} style={s.empty}>
            <Text style={s.emptyTitle}>Пока пусто</Text>
            <Text style={s.emptyText}>Соберите книгу из своих фото или закажите печать — всё окажется здесь.</Text>
            <View style={s.emptyBtns}>
              <Tap style={[s.emptyBtn, s.emptyPrimary]} onPress={() => router.push('/story')} accessibilityRole="button">
                <BookOpenTextIcon size={18} color="#fff" weight="fill" />
                <Text style={[s.emptyBtnText, { color: '#fff' }]}>Собрать книгу</Text>
              </Tap>
              <Tap style={s.emptyBtn} onPress={() => router.push('/print')} accessibilityRole="button">
                <ImagesIcon size={18} color={colors.fg} weight="fill" />
                <Text style={s.emptyBtnText}>Фотопечать</Text>
              </Tap>
            </View>
          </Animated.View>
        ) : (
          <>
            <View style={{ gap: 10 }}>
              {cart.map((it, i) => (
                <Animated.View key={it.id} entering={enterItem(i)} exiting={FadeOut.duration(duration.micro)} layout={layout}>
                  <SwipeToDelete label={it.title} onDelete={() => remove(it)}>
                    <ItemTile item={it} onEdit={() => edit(it)} onQty={(q) => setQty(it.id, q)} />
                  </SwipeToDelete>
                </Animated.View>
              ))}
            </View>
            <Animated.Text layout={layout} style={s.hint}>
              Потяните плитку влево, чтобы удалить
            </Animated.Text>

            <Animated.View layout={layout} style={{ gap: 10 }}>
              <Text style={s.h2}>Добавить к заказу</Text>
              <View style={s.extras}>
                {EXTRAS.map((e) => {
                  const on = extras.includes(e.id);
                  return (
                    <Tap
                      key={e.id}
                      style={[s.extra, on && s.extraOn]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleExtra(e.id);
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${e.title}, ${e.sub}, плюс ${rub(e.price)}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.extraTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={s.extraSub} numberOfLines={1}>{e.sub}</Text>
                      </View>
                      <Text style={[s.extraPrice, on && { color: colors.coralAction }]}>+{rub(e.price)}</Text>
                    </Tap>
                  );
                })}
              </View>
            </Animated.View>

            <Animated.View layout={layout}>
              <Tap style={s.cta} onPress={() => router.push('/checkout')} accessibilityRole="button" accessibilityLabel={`Оформить, ${rub(total)}`}>
                <Text style={s.ctaText}>Оформить</Text>
                <View style={s.ctaSum}>
                  <AnimatedNumber value={total} format={rub} style={s.ctaText} />
                </View>
              </Tap>
            </Animated.View>
          </>
        )}
      </ScrollView>

      {undo ? (
        <Animated.View
          key={undo.item.id}
          entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)}
          exiting={FadeOutDown.duration(duration.quick)}
          style={[s.toast, { bottom: insets.bottom + 72 }]}
          accessibilityLiveRegion="polite">
          <Countdown seconds={5} />
          <View style={{ flex: 1 }}>
            <Text style={s.toastText}>Удалено из корзины</Text>
            <Text style={s.toastSub} numberOfLines={1}>{undo.item.title}</Text>
          </View>
          <Tap
            onPress={() => {
              restoreToCart(undo.item, undo.index);
              setUndo(null);
              Haptics.selectionAsync().catch(() => {});
            }}
            accessibilityRole="button"
            hitSlop={10}>
            <Text style={s.toastAction}>Вернуть</Text>
          </Tap>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Круговой отсчёт до исчезновения «Вернуть»: кольцо тает, внутри — секунды. */
const ACircle = Animated.createAnimatedComponent(Circle);
function Countdown({ seconds }: { seconds: number }) {
  const R = 11;
  const L = 2 * Math.PI * R;
  const p = useSharedValue(0);
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    p.value = withTiming(1, { duration: seconds * 1000, easing: Easing.linear });
    const t = setInterval(() => setLeft((n) => Math.max(1, n - 1)), 1000);
    return () => clearInterval(t);
  }, [p, seconds]);
  const ring = useAnimatedProps(() => ({ strokeDashoffset: L * p.value }));
  return (
    <View style={s.cd}>
      <Svg width={28} height={28} style={StyleSheet.absoluteFill}>
        <ACircle cx={14} cy={14} r={R} stroke={colors.coralAction} strokeWidth={2} fill="none" strokeDasharray={L} animatedProps={ring} strokeLinecap="round" rotation={-90} origin="14,14" />
      </Svg>
      <Text style={s.cdText}>{left}</Text>
    </View>
  );
}

/**
 * Удаление как в Telegram: плитка едет за пальцем, красная подложка растёт следом.
 * Короткий свайп оставляет кнопку «Удалить», длинный (за половину ширины) — щелчок вибрацией
 * и при отпускании плитка улетает и удаляется. Быстрый бросок тоже удаляет.
 */
function SwipeToDelete({ label, onDelete, children }: { label: string; onDelete: () => void; children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const OPEN = -96;
  const FULL = -(width - 32) * 0.5;
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  const fly = () => {
    'worklet';
    x.value = withTiming(-width, { duration: 200, easing: ease.smoothOut }, (done) => {
      if (done) scheduleOnRN(onDelete);
    });
  };
  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onBegin: () => {
      'worklet';
      start.value = x.value;
    },
    onUpdate: (e) => {
      'worklet';
      const next = start.value + e.translationX;
      // вправо — с резиновым сопротивлением, влево — за пальцем
      x.value = next > 0 ? next * 0.15 : next;
      const a = x.value < FULL;
      if (a !== armed.value) {
        armed.value = a;
        scheduleOnRN(tick);
      }
    },
    onDeactivate: (e) => {
      'worklet';
      if (x.value < FULL || (e.velocityX < -1400 && x.value < OPEN / 2)) fly();
      else if (x.value < OPEN / 2) x.value = withSpring(OPEN, { damping: 30, stiffness: 300 });
      else x.value = withSpring(0, { damping: 30, stiffness: 300 });
      armed.value = false;
    },
  });
  const tile = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const back = useAnimatedStyle(() => ({
    width: Math.max(0, -x.value - 8),
    // пока плитка улетает, подложка гаснет — к удалению строки на её месте пусто
    opacity: x.value > -4 ? 0 : x.value < -width * 0.8 ? Math.max(0, (x.value + width) / (width * 0.2)) : 1,
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: withTiming(x.value < FULL ? 1.1 : 1, { duration: 150 }) }] }));
  return (
    <View>
      <Animated.View style={[s.delete, back]}>
        <Pressable style={s.deleteHit} onPress={() => x.set(withTiming(-width, { duration: 200 }, (d) => d && scheduleOnRN(onDelete)))} accessibilityRole="button" accessibilityLabel={`Удалить ${label}`}>
          <Animated.View style={[{ alignItems: 'center', gap: 4 }, icon]}>
            <TrashIcon size={22} color="#fff" weight="fill" />
            <Text style={s.deleteText} numberOfLines={1}>Удалить</Text>
          </Animated.View>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={tile}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Позиция: обложка слева, к правому краю уходит в размытие и в цвет плитки — на нём текст и цена. */
function ItemTile({ item, onEdit, onQty }: { item: CartItem; onEdit: () => void; onQty: (q: number) => void }) {
  return (
    <View style={s.tile}>
      {/* фон: та же фотография, сильно размытая, к правому краю тает в цвет плитки */}
      <View style={s.ambientWrap} pointerEvents="none">
        <Image source={pic(item.cover)} style={s.ambient} contentFit="cover" blurRadius={28} />
        {/* светлая вуаль приглушает цвет — фон спокойный, обложка выделяется */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(241,234,227,0.5)' }]} />
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(241,234,227,0.1)', 'rgba(241,234,227,0.7)', colors.card]}
        locations={[0, 0.45, 0.75]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {/* обложка — чёткая, как книга на полке */}
      <View style={s.cover}>
        <Image source={pic(item.cover)} style={StyleSheet.absoluteFill} contentFit="cover" />
        {/* стекло поверх обложки: блик из угла и светлая кромка */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, s.glassEdge]}
        />
      </View>
      <Pressable style={StyleSheet.absoluteFill} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${item.title}, ${rub(item.price * item.qty)}, изменить`} />
      <View style={s.info} pointerEvents="box-none">
        <View style={s.infoTop} pointerEvents="none">
          <View style={{ flex: 1 }}>
            <Text style={s.kind}>{item.tariff === 'print' ? 'Фотопечать' : 'Фотокнига'}</Text>
            <Text style={s.itemTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {item.tariff === 'print' ? `${item.pages} фото ${item.format}` : item.title}
            </Text>
            <Text style={s.itemSub} numberOfLines={1}>
              {item.tariff === 'print' ? `${item.finish.toLowerCase()} · будет ${item.readyBy}` : `${item.tariffName} ${item.format} · ${item.pages} стр.`}
            </Text>
          </View>
          <PencilSimpleIcon size={16} color={colors.mut} weight="bold" />
        </View>
        <View style={s.infoBottom} pointerEvents="box-none">
          <View style={s.stepper}>
            <Tap style={s.step} onPress={() => onQty(item.qty - 1)} disabled={item.qty === 1} accessibilityRole="button" accessibilityLabel="Меньше экземпляров" hitSlop={4}>
              <MinusIcon size={13} color={item.qty === 1 ? colors.mut2 : colors.fg} weight="bold" />
            </Tap>
            <AnimatedNumber value={item.qty} format={String} style={s.qty} />
            <Tap style={s.step} onPress={() => onQty(item.qty + 1)} accessibilityRole="button" accessibilityLabel="Больше экземпляров" hitSlop={4}>
              <PlusIcon size={13} color={colors.fg} weight="bold" />
            </Tap>
          </View>
          <AnimatedNumber value={Math.round(item.price * item.qty * 100) / 100} format={rub} style={s.price} />
        </View>
      </View>
    </View>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 6 },
  title: { fontSize: 36, lineHeight: 42, fontFamily: fonts.display, letterSpacing: -0.9, color: colors.fg },
  count: { fontSize: 15, fontFamily: fonts.semibold, color: colors.mut },
  h2: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 6 },

  tile: { height: 136, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card },
  ambientWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' },
  ambient: { position: 'absolute', left: -30, top: -30, bottom: -30, right: -30 },
  glassEdge: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  cover: { position: 'absolute', left: 12, top: 12, bottom: 12, width: 84, borderRadius: 14, overflow: 'hidden', boxShadow: '0 6px 14px -6px rgba(0,0,0,0.35)' },
  info: { position: 'absolute', left: 110, right: 0, top: 0, bottom: 0, padding: 14, paddingLeft: 4, justifyContent: 'space-between' },
  infoTop: { flexDirection: 'row', gap: 8 },
  kind: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.peachInk },
  itemTitle: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, marginTop: 1 },
  itemSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.medium, color: colors.mut, marginTop: 2 },
  infoBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, padding: 2 },
  step: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 18, textAlign: 'center', fontSize: 14, fontFamily: fonts.bold, color: colors.fg },
  price: { fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },

  delete: { position: 'absolute', right: 0, top: 0, bottom: 0, borderRadius: 26, backgroundColor: '#D9483B', overflow: 'hidden' },
  deleteHit: { flex: 1, minWidth: 88, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  hint: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut2, textAlign: 'center', marginTop: -4 },

  extras: { gap: 8 },
  // выбранная — только рамкой, без значков и галочек
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 2, borderColor: 'transparent' },
  extraOn: { borderColor: colors.coralAction },
  extraTitle: { fontSize: 16, lineHeight: 20, fontFamily: fonts.bold, color: colors.fg },
  extraSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut },
  extraPrice: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },

  cta: { height: 58, borderRadius: 29, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 8, marginTop: 6 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  ctaSum: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },

  empty: { backgroundColor: colors.card, borderRadius: 26, padding: 20, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.fg },
  emptyText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },
  emptyBtns: { flexDirection: 'row', gap: 8, marginTop: 8 },
  emptyBtn: { flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyPrimary: { backgroundColor: colors.coralAction },
  emptyBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },

  toast: {
    position: 'absolute', left: 12, right: 12, minHeight: 58, borderRadius: 26, backgroundColor: '#fff',
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 18, paddingVertical: 9,
    boxShadow: '0 12px 32px -12px rgba(60,40,30,0.35), 0 0 0 1px rgba(60,40,30,0.06)',
  },
  toastText: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.fg },
  toastSub: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  toastAction: { fontSize: 15, fontFamily: fonts.bold, color: colors.coralAction },
  cd: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  cdText: { fontSize: 12, fontFamily: fonts.bold, color: colors.coralAction, fontVariant: ['tabular-nums'] },
});
