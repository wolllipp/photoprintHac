/**
 * «Оформление» — после корзины: что заказываем (одной строкой), доставка, оплата (карта или ЕРИП),
 * получатель (телефон, код из SMS — только при первом заказе, A10), пики, итог и «Оплатить».
 * Выбор доставки и оплаты — строками с рамкой, как допуслуги в корзине; итог шрифтом заголовков;
 * кнопка — как «Оформить»: текст слева, сумма в пилюле справа.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CheckIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceTile } from '@/components/choice';
import { Pik, Tap } from '@/components/ui';
import { delivery, payments, PIK_RATE, phoneMasked } from '@/data/demo';
import { pic } from '@/data/photos';
import { cartTotal, rub, useStore } from '@/data/store';
import { AnimatedNumber, ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const { cart, placeOrder, points, extras } = useStore();
  const [deliveryId, setDeliveryId] = useState<string>(delivery[0].id);
  const [payId, setPayId] = useState<string>(payments[0].id);
  const [usePiks, setUsePiks] = useState(false);

  if (!cart.length) {
    return (
      <View style={[s.screen, s.empty, { paddingTop: insets.top }]}>
        <Text style={s.emptyTitle}>Корзина пуста</Text>
        <Tap style={s.emptyBtn} onPress={() => router.back()} accessibilityRole="button">
          <Text style={s.emptyBtnText}>Назад</Text>
        </Tap>
      </View>
    );
  }

  const d = delivery.find((x) => x.id === deliveryId) ?? delivery[0];
  const piksOff = usePiks ? Math.round(points * PIK_RATE * 100) / 100 : 0;
  const goods = cartTotal(cart, extras);
  const total = Math.round((goods + d.price - piksOff) * 100) / 100;
  const pieces = cart.reduce((a, it) => a + it.qty, 0);

  const onPay = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    placeOrder(total, usePiks ? points : 0);
    router.dismissAll();
    router.navigate('/orders');
  };
  const enter = (i: number) => FadeInDown.delay(60 * i).duration(420).easing(ease.smoothOut);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>
        <Animated.Text entering={enter(0)} style={s.title}>
          Оформление
        </Animated.Text>

        {/* что заказываем — одной строкой, полный список уже был в корзине */}
        <Animated.View entering={enter(1)}>
          <Tap style={s.goods} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={`${pieces} товара, ${rub(goods)}, вернуться в корзину`}>
            <View style={s.covers}>
              {cart.slice(0, 3).map((it, i) => (
                <Image key={it.id} source={pic(it.cover)} style={[s.cover, { marginLeft: i ? -14 : 0, zIndex: 3 - i }]} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.goodsTitle} numberOfLines={1}>{cart.length === 1 ? cart[0].title : `${cart[0].title} и ещё ${cart.length - 1}`}</Text>
              <Text style={s.goodsSub}>{pieces} {pieces === 1 ? 'товар' : pieces < 5 ? 'товара' : 'товаров'}{extras.length ? ' · с допуслугами' : ''}</Text>
            </View>
            <Text style={s.goodsSum}>{rub(goods)}</Text>
          </Tap>
        </Animated.View>

        <Animated.View entering={enter(2)} style={s.section}>
          <Text style={s.h2}>Доставка</Text>
          {delivery.map((x) => (
            <ChoiceTile key={x.id} title={x.title} sub={x.sub} right={rub(x.price)} on={x.id === deliveryId} onPick={() => setDeliveryId(x.id)} />
          ))}
        </Animated.View>

        <Animated.View entering={enter(3)} style={s.section}>
          <Text style={s.h2}>Оплата</Text>
          {payments.map((x) => (
            <ChoiceTile key={x.id} title={x.title} sub={x.sub} on={x.id === payId} onPick={() => setPayId(x.id)} />
          ))}
          <View style={s.row}>
            <Pik size={28} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Списать пики</Text>
              <Text style={s.rowSub}>{points} пиков · −{rub(points * PIK_RATE)}</Text>
            </View>
            <Switch
              value={usePiks}
              onValueChange={(v) => {
                Haptics.selectionAsync().catch(() => {});
                setUsePiks(v);
              }}
              trackColor={{ true: colors.coralAction, false: colors.card2 }}
              thumbColor="#fff"
              ios_backgroundColor={colors.card2}
              accessibilityLabel="Списать пики"
            />
          </View>
        </Animated.View>

        <Animated.View entering={enter(4)} style={s.section}>
          <Text style={s.h2}>Получатель</Text>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{phoneMasked}</Text>
              <Text style={s.rowSub}>код из SMS — только при первом заказе</Text>
            </View>
            <Text style={s.link}>Изменить</Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(5)} style={s.sums}>
          <View style={s.sum}><Text style={s.sumL}>Товары{extras.length ? ' и услуги' : ''}</Text><AnimatedNumber value={goods} format={rub} style={s.sumR} /></View>
          <View style={s.sum}><Text style={s.sumL}>Доставка</Text><AnimatedNumber value={d.price} format={rub} style={s.sumR} /></View>
          {usePiks ? <View style={s.sum}><Text style={s.sumL}>Пики</Text><Text style={[s.sumR, { color: colors.tealInk }]}>−{rub(piksOff)}</Text></View> : null}
          <View style={[s.sum, { marginTop: 4 }]}><Text style={s.totalL}>Итого</Text><AnimatedNumber value={total} format={rub} style={s.totalR} /></View>
        </Animated.View>

        {/* проверка качества — тихой строкой, как на экране книги */}
        <View style={s.ok}>
          <CheckIcon size={14} color={colors.tealInk} weight="bold" />
          <Text style={s.okText}>Проверено: лица в кадре, резкость в норме. Отмена — до начала печати.</Text>
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <Tap style={s.cta} onPress={onPay} accessibilityRole="button" accessibilityLabel={`Оплатить ${rub(total)}`}>
          <Text style={s.ctaText}>{payId === 'erip' ? 'Получить номер ЕРИП' : 'Оплатить'}</Text>
          <View style={s.ctaSum}>
            <AnimatedNumber value={total} format={rub} style={s.ctaPrice} />
          </View>
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, gap: 18 },
  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  h2: { fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginBottom: 2 },
  section: { gap: 8 },

  goods: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, padding: 12, paddingRight: 16 },
  covers: { flexDirection: 'row' },
  cover: { width: 44, height: 52, borderRadius: 10, borderWidth: 2, borderColor: colors.card },
  goodsTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  goodsSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  goodsSum: { fontSize: 16, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16 },
  rowTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink },

  sums: { gap: 4, paddingHorizontal: 4 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sumL: { fontSize: 15, fontFamily: fonts.regular, color: colors.mut },
  sumR: { fontSize: 15, fontFamily: fonts.medium, color: colors.fg },
  totalL: { fontSize: 17, fontFamily: fonts.bold, color: colors.fg },
  totalR: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },

  ok: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 4 },
  okText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.medium, color: colors.tealInk },

  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 58, borderRadius: 29, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 8 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  ctaSum: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  ctaPrice: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: '#fff' },

  empty: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.fg },
  emptyBtn: { height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: colors.coralAction, justifyContent: 'center' },
  emptyBtnText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
});
