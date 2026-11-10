/**
 * Карты оплаты — «колесо»: карты стоят по дуге, центральная крупно и прямо, соседние уходят назад
 * с поворотом. Листаешь — колесо крутится. Последняя — «Добавить карту» с формой.
 * Выбор — «Оплатить этой картой». Номер в демо не проверяется банком, сохраняются последние 4 цифры.
 */
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { PlusIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, interpolate, useAnimatedKeyboard, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import type { Card } from '@/data/demo';
import { useStore } from '@/data/store';
import { ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Cards() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { cards, cardId, setCardId, addCard } = useStore();
  const W = Math.round(width * 0.8);
  const H = Math.round(W * 0.63);
  const STEP = W * 0.62; // карты заходят друг на друга — так дуга читается как колесо
  const start = Math.max(0, cards.findIndex((c) => c.id === cardId));
  const x = useSharedValue(start * STEP);
  const [at, setAt] = useState(start); // какая карта по центру
  // с какой карты колесо открывается (в т.ч. после «Отмены» в форме). Не `at`: смена contentOffset
  // посреди прокрутки на iOS дёргает ScrollView на эту позицию — карты «застревали».
  const [openAt, setOpenAt] = useState(start);
  const [adding, setAdding] = useState(false); // форма новой карты
  const [num, setNum] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  // кнопка «Сохранить» едет вместе с клавиатурой — её всегда видно и можно нажать
  const kb = useAnimatedKeyboard();
  const bottomPad = insets.bottom + 12;
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(kb.height.value + 12, bottomPad) }));

  const tick = (i: number) => {
    setAt(i);
    Haptics.selectionAsync().catch(() => {});
  };
  const idx = useSharedValue(start);
  const last = cards.length - 1;
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
    // карта сменилась по центру — щелчок и подпись под колесом
    const i = Math.max(0, Math.min(last, Math.round(e.contentOffset.x / STEP)));
    if (i !== idx.value) {
      idx.value = i;
      scheduleOnRN(tick, i);
    }
  });

  const digits = num.replace(/\D/g, '');
  const ready = digits.length >= 16 && /^\d{2}\/\d{2}$/.test(exp) && cvc.length === 3;
  const choose = () => {
    if (adding) {
      if (!ready) return;
      const brand: Card['brand'] = digits[0] === '4' ? 'Visa' : digits[0] === '5' ? 'Mastercard' : 'Белкарт';
      addCard({ id: `c${Date.now()}`, brand, last4: digits.slice(-4), bank: 'новая карта', colors: ['#3B4B4A', '#7C8B89'] });
    } else {
      setCardId(cards[at].id);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  return (
    <View style={[s.screen, { paddingTop: 12 }]}>
      <View style={s.head}>
        <Text style={s.title}>Карты</Text>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      {/* при добавлении колесо уходит: форма и кнопка должны поместиться над клавиатурой */}
      {adding ? null : (
      <View style={{ flex: 1, justifyContent: 'center' }}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentOffset={{ x: openAt * STEP, y: 0 }}
        contentContainerStyle={{ paddingHorizontal: (width - STEP) / 2, height: H + 70, alignItems: 'center' }}
        style={{ flexGrow: 0 }}>
        {cards.map((c, i) => (
          <WheelCard key={c.id} i={i} x={x} step={STEP} w={W} h={H}>
            {/* без отдельного входа: экран и так выезжает снизу, второй вход поверх давал прыжки и мерцание */}
            <CardFace card={c} w={W} h={H} />
          </WheelCard>
        ))}
      </Animated.ScrollView>

      <View style={s.dots}>
        {cards.map((c, i) => (
          <View key={c.id} style={[s.dot, i === at && s.dotOn]} />
        ))}
      </View>
      </View>
      )}

      {adding ? (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
        <Animated.View entering={FadeIn.duration(220).easing(ease.smoothOut)} style={s.form}>
          <Text style={s.formTitle}>Новая карта</Text>
          <TextInput
            value={num}
            onChangeText={(t) => setNum(t.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '))}
            placeholder="Номер карты"
            placeholderTextColor={colors.mut2}
            keyboardType="number-pad"
            autoFocus
            style={s.input}
            accessibilityLabel="Номер карты"
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={exp}
              onChangeText={(t) => {
                const d = t.replace(/\D/g, '').slice(0, 4);
                setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              }}
              placeholder="ММ/ГГ"
              placeholderTextColor={colors.mut2}
              keyboardType="number-pad"
              style={[s.input, { flex: 1 }]}
              accessibilityLabel="Срок действия"
            />
            <TextInput
              value={cvc}
              onChangeText={(t) => setCvc(t.replace(/\D/g, '').slice(0, 3))}
              placeholder="CVC"
              placeholderTextColor={colors.mut2}
              keyboardType="number-pad"
              secureTextEntry
              style={[s.input, { flex: 1 }]}
              accessibilityLabel="Код CVC"
            />
          </View>
        </Animated.View>
        </ScrollView>
      ) : (
        <View style={{ alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <Text style={s.cardInfo}>
            {cards[at]?.brand} •• {cards[at]?.last4} · {cards[at]?.bank}
            {cards[at]?.id === cardId ? ' · сейчас выбрана' : ''}
          </Text>
          <Tap style={s.addBtn} onPress={() => {
              setOpenAt(at);
              setAdding(true);
            }}
            accessibilityRole="button">
            <PlusIcon size={16} color={colors.fg} weight="bold" />
            <Text style={s.addBtnText}>Добавить карту</Text>
          </Tap>
        </View>
      )}

      <Animated.View style={[s.bottom, lift]}>
        <Tap style={[s.cta, adding && !ready && { opacity: 0.4 }]} onPress={choose} disabled={adding && !ready} accessibilityRole="button">
          <Text style={s.ctaText}>{adding ? 'Сохранить и выбрать' : 'Оплатить этой картой'}</Text>
        </Tap>
        {adding ? (
          <Tap style={s.cancel} onPress={() => setAdding(false)} accessibilityRole="button">
            <Text style={s.cancelText}>Отмена</Text>
          </Tap>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Карта на колесе: по центру — прямо и крупно; чем дальше — тем ниже, меньше и сильнее повёрнута. */
function WheelCard({ i, x, step, w, h, children }: { i: number; x: SharedValue<number>; step: number; w: number; h: number; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const d = (x.value - i * step) / step; // −1 … 0 … 1
    return {
      zIndex: Math.round(100 - Math.abs(d) * 10),
      opacity: interpolate(Math.abs(d), [0, 1.6, 2.4], [1, 0.75, 0]),
      transform: [
        { perspective: 900 },
        { translateY: interpolate(Math.abs(d), [0, 1, 2], [0, 22, 70]) },
        { rotateY: `${interpolate(d, [-2, -1, 0, 1, 2], [55, 32, 0, -32, -55])}deg` },
        { rotateZ: `${interpolate(d, [-2, 0, 2], [8, 0, -8])}deg` },
        { scale: interpolate(Math.abs(d), [0, 1, 2], [1, 0.84, 0.7]) },
      ],
    };
  });
  return <Animated.View style={[{ width: step, height: h + 70, alignItems: 'center', justifyContent: 'center' }, a]}>{children}</Animated.View>;
}

function CardFace({ card, w, h }: { card: Card; w: number; h: number }) {
  return (
    <LinearGradient colors={card.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.card, { width: w, height: h }]}>
      {/* блик по диагонали */}
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} locations={[0.2, 0.45, 0.7]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={s.bank}>{card.bank}</Text>
      <View style={s.chip} />
      <Text style={s.number}>•••• •••• •••• {card.last4}</Text>
      <Text style={s.brand}>{card.brand}</Text>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 6 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.7, color: colors.fg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },

  card: { borderRadius: 20, padding: 18, justifyContent: 'space-between', overflow: 'hidden', boxShadow: '0 18px 36px -18px rgba(30,20,15,0.55)' },
  bank: { fontSize: 14, fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.85)' },
  chip: { width: 38, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,220,160,0.75)' },
  number: { fontSize: 17, fontFamily: fonts.semibold, letterSpacing: 1, color: '#fff' },
  brand: { position: 'absolute', right: 18, top: 16, fontSize: 16, fontFamily: fonts.display, color: '#fff' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 20, borderRadius: 23, backgroundColor: colors.card },
  addBtnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  formTitle: { fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginBottom: 2 },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.mut },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.card2 },
  dotOn: { width: 18, backgroundColor: colors.fg },
  cardInfo: { textAlign: 'center', fontSize: 15, fontFamily: fonts.medium, color: colors.mut },

  form: { paddingHorizontal: 16, gap: 8, marginTop: 16 },
  input: { height: 52, borderRadius: 18, backgroundColor: colors.card, paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.medium, color: colors.fg },

  bottom: { paddingHorizontal: 16, paddingTop: 10 },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
