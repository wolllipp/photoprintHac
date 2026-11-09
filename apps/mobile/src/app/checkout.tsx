/**
 * «Оформление» — модальный шаг: телефон, доставка, списание пиков, итог, оплата чипом у кнопки.
 */
import { router } from 'expo-router';
import { CaretRightIcon, CheckIcon, DeviceMobileIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Photo, Pik, Tap } from '@/components/ui';
import { delivery, PIK_RATE, phoneMasked } from '@/data/demo';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber, enterItem } from '@/motion';
import { colors } from '@/theme';

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const { cart, placeOrder, points } = useStore();
  const [deliveryId, setDeliveryId] = useState<string>(delivery[0].id);
  const [usePiks, setUsePiks] = useState(false);
  const item = cart[0];

  if (!item) {
    return (
      <View style={[s.screen, s.empty, { paddingTop: insets.top }]}>
        <Text style={s.emptyTitle}>Корзина пуста</Text>
        <Tap style={s.emptyBtn} onPress={() => router.replace('/')} accessibilityRole="button">
          <Text style={s.emptyBtnText}>Собрать книгу</Text>
        </Tap>
      </View>
    );
  }

  const d = delivery.find((x) => x.id === deliveryId) ?? delivery[0];
  const piksOff = usePiks ? Math.round(points * PIK_RATE * 100) / 100 : 0;
  const total = Math.round((item.price + d.price - piksOff) * 100) / 100;

  const onPay = () => {
    placeOrder(total, usePiks ? points : 0);
    router.dismissAll();
    router.navigate('/orders');
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
        <Text style={s.navTitle}>Оформление</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.group}>
          <View style={s.row}>
            <Photo k={item.cover} style={s.thumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{item.title}</Text>
              <Text style={s.rowSub}>{item.tariffName} {item.format} · {item.pages} страницы · {item.finish.toLowerCase()}</Text>
            </View>
            <Text style={s.value}>{rub(item.price)}</Text>
          </View>
          <View style={s.row}>
            <View style={s.divider} />
            <View style={{ width: 52, alignItems: 'center' }}><DeviceMobileIcon size={22} color={colors.ink2} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>{phoneMasked}</Text>
              <Text style={s.rowSub}>код из SMS — только при первом заказе</Text>
            </View>
          </View>
        </View>

        <View style={s.sec}>
          <Text style={s.secTitle}>Доставка</Text>
          <Tap hitSlop={10} accessibilityRole="button"><Text style={s.secAction}>Ещё 3 способа</Text></Tap>
        </View>
        <View style={s.group} accessibilityRole="radiogroup">
          {delivery.map((x, i) => {
            const on = x.id === deliveryId;
            return (
              <Tap key={x.id} style={s.row} onPress={() => setDeliveryId(x.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                {i > 0 ? <View style={s.divider} /> : null}
                <View style={[s.radio, on && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{x.title}</Text>
                  <Text style={s.rowSub}>{x.sub}</Text>
                </View>
                <Text style={s.value}>{rub(x.price)}</Text>
              </Tap>
            );
          })}
        </View>

        <View style={s.group}>
          <View style={s.row}>
            <Pik size={26} />
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Списать пики</Text>
              <Text style={s.rowSub}>{points} пиков — баллы за друзей</Text>
            </View>
            <Switch
              value={usePiks}
              onValueChange={setUsePiks}
              trackColor={{ true: colors.coralAction, false: colors.card2 }}
              thumbColor="#fff"
              ios_backgroundColor={colors.card2}
              accessibilityLabel="Списать пики"
            />
          </View>
        </View>

        <View style={{ gap: 2, paddingHorizontal: 4 }}>
          <View style={s.sum}><Text style={s.sumL}>Книга</Text><Text style={s.sumR}>{rub(item.price)}</Text></View>
          <View style={s.sum}><Text style={s.sumL}>Доставка</Text><Text style={s.sumR}>{rub(d.price)}</Text></View>
          {usePiks ? <Animated.View entering={enterItem()} style={s.sum}><Text style={s.sumL}>Пики</Text><Text style={[s.sumR, { color: colors.tealInk }]}>−{rub(piksOff)}</Text></Animated.View> : null}
          <View style={[s.sum, { paddingTop: 4 }]}><Text style={s.total}>Итого</Text><AnimatedNumber value={total} format={rub} style={s.total} /></View>
        </View>

        <View style={s.hint}>
          <View style={s.okDot}><CheckIcon size={12} color="#fff" weight="bold" /></View>
          <Text style={s.hintText}><Text style={{ fontWeight: '700' }}>Проверено:</Text> лица в кадре, резкость в норме. Отмена — до начала печати.</Text>
        </View>
      </ScrollView>

      <View style={[s.paybar, { paddingBottom: insets.bottom + 10 }]}>
        <Tap style={s.chip} accessibilityRole="button" accessibilityLabel="Способ оплаты: карта 4242">
          <View style={s.card} />
          <Text style={s.chipText}>•• 4242</Text>
          <CaretRightIcon size={12} color={colors.fg} weight="bold" />
        </Tap>
        <Tap style={s.pay} onPress={onPay} accessibilityRole="button">
          <View style={{ flexDirection: 'row' }}><Text style={s.payText}>Оплатить </Text><AnimatedNumber value={total} format={rub} style={s.payText} /></View>
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600', color: colors.fg },
  content: { paddingHorizontal: 18, gap: 12, paddingBottom: 24 },
  group: { backgroundColor: colors.card, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  divider: { position: 'absolute', top: 0, left: 16, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.hair },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.fg, letterSpacing: -0.15 },
  rowSub: { fontSize: 13, color: colors.mut, marginTop: 1 },
  value: { fontSize: 16, fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 },
  secTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4, color: colors.fg },
  secAction: { fontSize: 15, fontWeight: '500', color: colors.coralLink },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.mut2 },
  radioOn: { borderWidth: 7, borderColor: colors.coralAction },
  sum: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sumL: { fontSize: 15, color: colors.mut },
  sumR: { fontSize: 15, color: colors.fg, fontVariant: ['tabular-nums'] },
  total: { fontSize: 17, fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },
  hint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.tealTint, borderRadius: 20, padding: 14 },
  okDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  hintText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.fg },
  paybar: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.bg },
  chip: { height: 54, borderRadius: 16, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  card: { width: 30, height: 20, borderRadius: 4, backgroundColor: colors.ink2 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.fg },
  pay: { flex: 1, height: 54, borderRadius: 16, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  payText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  emptyBtn: { height: 48, paddingHorizontal: 22, borderRadius: 14, backgroundColor: colors.coralAction, justifyContent: 'center' },
  emptyBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
