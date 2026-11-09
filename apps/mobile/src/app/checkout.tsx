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
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceTile } from '@/components/choice';
import { Pik, Tap } from '@/components/ui';
import { delivery, payments, PIK_RATE } from '@/data/demo';
import { pic } from '@/data/photos';
import { cartTotal, rub, useStore } from '@/data/store';
import { AnimatedNumber, ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const { cart, placeOrder, points, extras, cards, cardId, phone, setPhone } = useStore();
  const card = cards.find((c) => c.id === cardId) ?? cards[0];
  // телефон: смотреть → ввести новый → код из SMS (демо-код 0000)
  const [phoneStep, setPhoneStep] = useState<'view' | 'edit' | 'code'>('view');
  const [draftPhone, setDraftPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // правим номер — как только клавиатура поднялась, докручиваем к полю
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (phoneStep !== 'view') scroll.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [phoneStep]);
  const [deliveryId, setDeliveryId] = useState<string>(delivery[0].id);
  const [payId, setPayId] = useState<string>(payments[0].id);
  const [usePiks, setUsePiks] = useState(false);
  // согласия, как на сайте: без обеих галочек оплатить нельзя
  const [agree, setAgree] = useState({ offer: false, print: false });
  const [nudge, setNudge] = useState(false);
  const agreed = agree.offer && agree.print;

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
    if (!agreed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setNudge(true);
      scroll.current?.scrollToEnd({ animated: true });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    placeOrder(total, usePiks ? points : 0);
    router.dismissAll();
    router.navigate('/orders');
  };
  const enter = (i: number) => FadeInDown.delay(60 * i).duration(420).easing(ease.smoothOut);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => (router.canGoBack() ? router.back() : router.replace('/cart'))} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
        // iOS сам поднимает поле ввода над клавиатурой и плавно прокручивает к нему
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
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
          {/* карта: выбрана — нажатие открывает колесо карт, чтобы сменить или добавить */}
          <ChoiceTile
            title={`${card.brand} •• ${card.last4}`}
            sub={`${card.bank} · нажмите, чтобы сменить`}
            on={payId === 'card'}
            onPick={() => (payId === 'card' ? router.push('/cards') : setPayId('card'))}
          />
          {payments
            .filter((x) => x.id !== 'card')
            .map((x) => (
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
          {phoneStep === 'view' ? (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{phone}</Text>
                <Text style={s.rowSub}>код из SMS — только при первом заказе</Text>
              </View>
              <Tap onPress={() => setPhoneStep('edit')} accessibilityRole="button" hitSlop={10}>
                <Text style={s.link}>Изменить</Text>
              </Tap>
            </View>
          ) : phoneStep === 'edit' ? (
            <Animated.View entering={FadeInDown.duration(260).easing(ease.smoothOut)} style={s.editBox}>
              <TextInput
                value={draftPhone}
                onChangeText={(t) => setDraftPhone(formatPhone(t))}
                placeholder="+375 __ ___-__-__"
                placeholderTextColor={colors.mut2}
                keyboardType="phone-pad"
                autoFocus
                style={s.input}
                accessibilityLabel="Новый номер телефона"
              />
              <View style={s.editBtns}>
                <Tap style={[s.small, s.smallPlain]} onPress={() => setPhoneStep('view')} accessibilityRole="button">
                  <Text style={s.smallPlainText}>Отмена</Text>
                </Tap>
                <Tap
                  style={[s.small, draftPhone.replace(/\D/g, '').length < 12 && { opacity: 0.4 }]}
                  disabled={draftPhone.replace(/\D/g, '').length < 12}
                  onPress={() => {
                    setCode('');
                    setCodeErr(false);
                    setPhoneStep('code');
                  }}
                  accessibilityRole="button">
                  <Text style={s.smallText}>Получить код</Text>
                </Tap>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.duration(260).easing(ease.smoothOut)} style={s.editBox}>
              <Text style={s.rowSub}>Код из SMS на {draftPhone} · в демо — 0000</Text>
              <TextInput
                value={code}
                onChangeText={(t) => {
                  const c = t.replace(/\D/g, '').slice(0, 4);
                  setCode(c);
                  setCodeErr(false);
                  if (c.length === 4) {
                    if (c === '0000') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      setPhone(draftPhone);
                      setPhoneStep('view');
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
                      setCodeErr(true);
                    }
                  }
                }}
                placeholder="• • • •"
                placeholderTextColor={colors.mut2}
                keyboardType="number-pad"
                autoFocus
                style={[s.input, s.code, codeErr && { borderColor: colors.coralAction }]}
                accessibilityLabel="Код из SMS"
              />
              {codeErr ? <Text style={s.err}>Код не подошёл — проверьте SMS</Text> : null}
            </Animated.View>
          )}
        </Animated.View>

        <Animated.View entering={enter(5)} style={s.sums}>
          <View style={s.sum}><Text style={s.sumL}>Товары{extras.length ? ' и услуги' : ''}</Text><AnimatedNumber value={goods} format={rub} style={s.sumR} /></View>
          <View style={s.sum}><Text style={s.sumL}>Доставка</Text><AnimatedNumber value={d.price} format={rub} style={s.sumR} /></View>
          {usePiks ? <View style={s.sum}><Text style={s.sumL}>Пики</Text><Text style={[s.sumR, { color: colors.tealInk }]}>−{rub(piksOff)}</Text></View> : null}
          <View style={[s.sum, { marginTop: 4 }]}><Text style={s.totalL}>Итого</Text><AnimatedNumber value={total} format={rub} style={s.totalR} /></View>
        </Animated.View>

        {/* согласия — как на сайте; без них «Оплатить» не сработает */}
        <View style={s.agrees}>
          <Agree
            on={agree.offer}
            warn={nudge && !agree.offer}
            onToggle={() => setAgree((a) => ({ ...a, offer: !a.offer }))}
            text={
              <>
                Принимаю условия <Text style={s.agreeLink}>публичной оферты</Text> и <Text style={s.agreeLink}>политики обработки персональных данных</Text>
              </>
            }
          />
          <Agree
            on={agree.print}
            warn={nudge && !agree.print}
            onToggle={() => setAgree((a) => ({ ...a, print: !a.print }))}
            text="Понимаю: после оплаты заказ уходит в печать, отменить можно только до её начала. За содержание заказа отвечаю я"
          />
        </View>

      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <Tap style={[s.cta, !agreed && { opacity: 0.45 }]} onPress={onPay} accessibilityRole="button" accessibilityState={{ disabled: !agreed }} accessibilityLabel={agreed ? `Оплатить ${rub(total)}` : 'Оплатить — сначала отметьте согласия'}>
          <Text style={s.ctaText}>{payId === 'erip' ? 'Получить номер ЕРИП' : 'Оплатить'}</Text>
          <View style={s.ctaSum}>
            <AnimatedNumber value={total} format={rub} style={s.ctaPrice} />
          </View>
        </Tap>
      </View>
    </View>
  );
}

/** Галочка согласия: квадрат слева, текст справа; неотмеченная после попытки оплаты — коралловая рамка. */
function Agree({ on, warn, text, onToggle }: { on: boolean; warn: boolean; text: React.ReactNode; onToggle: () => void }) {
  return (
    <Tap
      style={s.agree}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}>
      <View style={[s.box, on && s.boxOn, warn && s.boxWarn]}>{on ? <CheckIcon size={13} color="#fff" weight="bold" /> : null}</View>
      <Text style={[s.agreeText, warn && { color: colors.coralAction }]}>{text}</Text>
    </Tap>
  );
}

/** +375 29 123-45-67 — по мере ввода. */
function formatPhone(t: string) {
  let d = t.replace(/\D/g, '');
  if (!d.startsWith('375')) d = `375${d.replace(/^375?/, '')}`;
  d = d.slice(0, 12);
  const p = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12)];
  return `+${p[0]}${p[1] ? ` ${p[1]}` : ''}${p[2] ? ` ${p[2]}` : ''}${p[3] ? `-${p[3]}` : ''}${p[4] ? `-${p[4]}` : ''}`;
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
  editBox: { backgroundColor: colors.card, borderRadius: 22, padding: 12, gap: 10 },
  input: { height: 50, borderRadius: 16, backgroundColor: '#fff', paddingHorizontal: 14, fontSize: 18, fontFamily: fonts.semibold, color: colors.fg, borderWidth: 2, borderColor: 'transparent' },
  code: { textAlign: 'center', letterSpacing: 10, fontSize: 22 },
  err: { fontSize: 13, fontFamily: fonts.medium, color: colors.coralAction, textAlign: 'center' },
  editBtns: { flexDirection: 'row', gap: 8 },
  small: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  smallText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  smallPlain: { backgroundColor: colors.card2 },
  smallPlainText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },

  sums: { gap: 4, paddingHorizontal: 4 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sumL: { fontSize: 15, fontFamily: fonts.regular, color: colors.mut },
  sumR: { fontSize: 15, fontFamily: fonts.medium, color: colors.fg },
  totalL: { fontSize: 17, fontFamily: fonts.bold, color: colors.fg },
  totalR: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },

  agrees: { gap: 10, paddingHorizontal: 2 },
  agree: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: colors.mut2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.coralAction, borderColor: colors.coralAction },
  boxWarn: { borderColor: colors.coralAction },
  agreeText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.regular, color: colors.fg },
  agreeLink: { fontFamily: fonts.semibold, color: colors.coralLink },

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
