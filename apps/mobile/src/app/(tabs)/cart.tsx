/**
 * Корзина. Каждая позиция — плитка: обложка слева уходит в размытие вправо, справа название,
 * параметры, цена и число экземпляров. Нажатие — править, свайп влево — удалить (с «Вернуть»).
 * Ниже — допуслуги и итог одной строкой в кнопке «Оформить».
 * apple-design: прямое управление (свайп за пальцем), прощение ошибок (вернуть удалённое),
 * отклик сразу (вибрация, пересчёт суммы), пространственная связность (соседи сдвигаются, а не прыгают).
 */
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { BookOpenTextIcon, CheckIcon, ImagesIcon, MinusIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaskedView } from '@/components/glass';
import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { cartTotal, EXTRAS, rub, useStore, type CartItem } from '@/data/store';
import { AnimatedNumber, duration, ease, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const layout = LinearTransition.springify().damping(22).stiffness(220).reduceMotion(ReduceMotion.System);

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
                <Animated.View key={it.id} entering={enterItem(i)} exiting={FadeOut.duration(duration.fast)} layout={layout}>
                  <ReanimatedSwipeable
                    friction={1.6}
                    rightThreshold={60}
                    overshootRight={false}
                    renderRightActions={() => (
                      <Tap style={s.delete} onPress={() => remove(it)} accessibilityRole="button" accessibilityLabel={`Удалить ${it.title}`}>
                        <TrashIcon size={22} color="#fff" weight="fill" />
                        <Text style={s.deleteText}>Удалить</Text>
                      </Tap>
                    )}>
                    <ItemTile item={it} onEdit={() => edit(it)} onQty={(q) => setQty(it.id, q)} />
                  </ReanimatedSwipeable>
                </Animated.View>
              ))}
            </View>
            <Animated.Text layout={layout} style={s.hint}>
              Смахните влево, чтобы удалить
            </Animated.Text>

            <Animated.View layout={layout} style={{ gap: 10 }}>
              <Text style={s.h2}>Добавить к заказу</Text>
              <View style={s.group}>
                {EXTRAS.map((e) => {
                  const on = extras.includes(e.id);
                  return (
                    <Tap
                      key={e.id}
                      style={s.extra}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleExtra(e.id);
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.extraTitle}>{e.title}</Text>
                        <Text style={s.extraSub}>{e.sub}</Text>
                      </View>
                      <Text style={s.extraPrice}>+{rub(e.price)}</Text>
                      <View style={[s.box, on && s.boxOn]}>
                        {on ? (
                          <Animated.View entering={FadeIn.duration(duration.quick)}>
                            <CheckIcon size={13} color="#fff" weight="bold" />
                          </Animated.View>
                        ) : null}
                      </View>
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
          entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)}
          exiting={FadeOutDown.duration(duration.quick)}
          style={[s.toast, { bottom: insets.bottom + 96 }]}>
          <Text style={s.toastText} numberOfLines={1}>
            «{undo.item.title}» удалена
          </Text>
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

/** Позиция: обложка слева, к правому краю уходит в размытие и в цвет плитки — на нём текст и цена. */
function ItemTile({ item, onEdit, onQty }: { item: CartItem; onEdit: () => void; onQty: (q: number) => void }) {
  return (
    <View style={s.tile}>
      <Image source={pic(item.cover)} style={s.cover} contentFit="cover" />
      {Platform.OS !== 'web' ? (
        <MaskedView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          maskElement={<LinearGradient colors={['transparent', 'black']} locations={[0.12, 0.5]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        </MaskedView>
      ) : null}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(241,234,227,0)', 'rgba(241,234,227,0.55)', colors.card]}
        locations={[0.18, 0.42, 0.62]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={onEdit} accessibilityRole="button" accessibilityLabel={`${item.title}, ${rub(item.price * item.qty)}, изменить`} />
      <View style={s.info} pointerEvents="box-none">
        <View style={s.infoTop} pointerEvents="none">
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.itemSub} numberOfLines={1}>
              {item.tariff === 'print' ? `${item.pages} фото · ${item.finish.toLowerCase()}` : `${item.tariffName} ${item.format} · ${item.pages} стр.`}
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

  tile: { height: 124, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card },
  cover: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%' },
  info: { position: 'absolute', left: '38%', right: 0, top: 0, bottom: 0, padding: 14, paddingLeft: 10, justifyContent: 'space-between' },
  infoTop: { flexDirection: 'row', gap: 8 },
  itemTitle: { fontSize: 17, lineHeight: 21, fontFamily: fonts.bold, color: colors.fg },
  itemSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.medium, color: colors.mut, marginTop: 2 },
  infoBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 16, padding: 2 },
  step: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qty: { minWidth: 18, textAlign: 'center', fontSize: 14, fontFamily: fonts.bold, color: colors.fg },
  price: { fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },

  delete: { width: 96, marginLeft: 8, borderRadius: 26, backgroundColor: '#D9483B', alignItems: 'center', justifyContent: 'center', gap: 4 },
  deleteText: { fontSize: 13, fontFamily: fonts.semibold, color: '#fff' },
  hint: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut2, textAlign: 'center', marginTop: -4 },

  group: { backgroundColor: colors.card, borderRadius: 26, paddingVertical: 4 },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  extraTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  extraSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  extraPrice: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.mut2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.coralAction, borderColor: colors.coralAction },

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

  toast: { position: 'absolute', left: 16, right: 16, height: 52, borderRadius: 26, backgroundColor: colors.fg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 12 },
  toastText: { flex: 1, fontSize: 15, fontFamily: fonts.medium, color: '#fff' },
  toastAction: { fontSize: 15, fontFamily: fonts.bold, color: colors.peachStrong },
});
