/**
 * Правка данных профиля — листом снизу, в стиле приложения: имя, телефон (с кодом из SMS), доставка по умолчанию
 * (Европочта — пункт выдачи, остальное — адрес), карты (основная, удалить, добавить). Лист едет вместе с клавиатурой.
 * Демо: код из SMS — 0000; карты — без проверки банком.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CheckIcon, PlusIcon, TrashIcon } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChoiceTile } from '@/components/choice';
import { Tap } from '@/components/ui';
import { delivery as METHODS, pickupPoints } from '@/data/demo';
import { rub, useStore, type Address } from '@/data/store';
import { SHEET_TAIL, sheetIn, sheetOut } from '@/motion';
import { colors, fonts } from '@/theme';

export type EditWhat = 'name' | 'phone' | 'delivery' | 'cards';

export function ProfileEdit({ what, onClose }: { what: EditWhat; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, kb.height.value - insets.bottom) }] }));
  const title = { name: 'Имя', phone: 'Телефон', delivery: 'Доставка по умолчанию', cards: 'Карты' }[what];
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(240)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }, lift]}>
        <View style={s.grab} />
        <Text style={s.title}>{title}</Text>
        {what === 'name' ? <NameForm onDone={onClose} /> : null}
        {what === 'phone' ? <PhoneForm onDone={onClose} /> : null}
        {what === 'delivery' ? <DeliveryForm onDone={onClose} /> : null}
        {what === 'cards' ? <CardsForm onDone={onClose} /> : null}
      </Animated.View>
    </View>
  );
}

function NameForm({ onDone }: { onDone: () => void }) {
  const { name, setName } = useStore();
  const [v, setV] = useState(name);
  const ok = v.trim().length >= 2;
  return (
    <>
      <Field value={v} onChange={setV} placeholder="Как к вам обращаться" autoFocus />
      <Save off={!ok} onPress={() => { setName(v.trim()); done(); onDone(); }} />
    </>
  );
}

/** Телефон: новый номер → код из SMS (в демо 0000) → сохранили. */
function PhoneForm({ onDone }: { onDone: () => void }) {
  const { phone, setPhone } = useStore();
  const [step, setStep] = useState<'num' | 'code'>('num');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [bad, setBad] = useState(false);
  const digits = num.replace(/\D/g, '');
  const okNum = digits.length >= 9;
  if (step === 'num') {
    return (
      <>
        <Text style={s.hint}>Сейчас: {phone}</Text>
        <Field value={num} onChange={setNum} placeholder="+375 29 123-45-67" keyboard="phone-pad" autoFocus />
        <Save label="Получить код" off={!okNum} onPress={() => setStep('code')} />
      </>
    );
  }
  return (
    <>
      <Text style={s.hint}>Код из SMS на {num}. В демо — 0000.</Text>
      <Field value={code} onChange={(t) => { setCode(t); setBad(false); }} placeholder="Код из SMS" keyboard="number-pad" autoFocus warn={bad} />
      {bad ? <Text style={s.warn}>Код не подошёл — проверьте SMS</Text> : null}
      <Save
        label="Подтвердить"
        off={code.length < 4}
        onPress={() => {
          if (code !== '0000') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            return setBad(true);
          }
          setPhone(`+375 ${digits.slice(-9, -7)} •••-••-${digits.slice(-2)}`);
          done();
          onDone();
        }}
      />
    </>
  );
}

/** Доставка по умолчанию: способ; для Европочты — пункт выдачи, для остальных — адрес. Оформление открывается с ней. */
function DeliveryForm({ onDone }: { onDone: () => void }) {
  const { delivery, setDelivery } = useStore();
  const [id, setId] = useState(delivery.deliveryId);
  const [point, setPoint] = useState(delivery.pointId);
  const [addr, setAddr] = useState<Address>(delivery.address ?? { street: '', flat: '', entrance: '', note: '' });
  const toDoor = id !== 'evropochta';
  const ok = !toDoor || addr.street.trim().length >= 3;
  return (
    <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      {METHODS.map((m) => (
        <ChoiceTile key={m.id} title={m.title} sub={m.sub} right={rub(m.price)} on={m.id === id} onPick={() => setId(m.id)} />
      ))}
      <Text style={[s.label, { marginTop: 6 }]}>{toDoor ? 'Адрес' : 'Пункт выдачи'}</Text>
      {toDoor ? (
        <View style={{ gap: 8 }}>
          <Field value={addr.street} onChange={(t) => setAddr((a) => ({ ...a, street: t }))} placeholder="Улица и дом" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field value={addr.flat} onChange={(t) => setAddr((a) => ({ ...a, flat: t }))} placeholder="Квартира" keyboard="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field value={addr.entrance} onChange={(t) => setAddr((a) => ({ ...a, entrance: t }))} placeholder="Подъезд" keyboard="number-pad" />
            </View>
          </View>
          <Field value={addr.note} onChange={(t) => setAddr((a) => ({ ...a, note: t }))} placeholder="Комментарий курьеру" />
        </View>
      ) : (
        pickupPoints.map((p) => <ChoiceTile key={p.id} title={p.title} sub={`${p.address} · ${p.hours}`} right={p.dist} on={p.id === point} onPick={() => setPoint(p.id)} />)
      )}
      <Save
        off={!ok}
        onPress={() => {
          setDelivery({ deliveryId: id, pointId: point, address: toDoor ? { ...addr, street: addr.street.trim() } : delivery.address });
          done();
          onDone();
        }}
      />
    </ScrollView>
  );
}

/** Карты: основная — по нажатию, удалить — корзиной (последнюю удалить нельзя), добавить — в колесе карт. */
function CardsForm({ onDone }: { onDone: () => void }) {
  const { cards, cardId, setCardId, removeCard } = useStore();
  return (
    <View style={{ gap: 8 }}>
      {cards.map((c) => {
        const on = c.id === cardId;
        return (
          <View key={c.id} style={[s.card, on && s.cardOn]}>
            <Tap style={s.cardTap} onPress={() => { Haptics.selectionAsync().catch(() => {}); setCardId(c.id); }} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${c.brand} ${c.last4}, ${c.bank}${on ? ', основная' : ''}`}>
              <View style={[s.chip, { backgroundColor: c.colors[0] }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>{c.brand} •• {c.last4}</Text>
                <Text style={s.cardSub}>{on ? 'основная' : c.bank}</Text>
              </View>
              {on ? <CheckIcon size={18} color={colors.coralAction} weight="bold" /> : null}
            </Tap>
            {cards.length > 1 ? (
              <Tap onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); removeCard(c.id); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Удалить карту ${c.last4}`}>
                <TrashIcon size={18} color={colors.mut} weight="bold" />
              </Tap>
            ) : null}
          </View>
        );
      })}
      <Tap
        style={s.add}
        onPress={() => {
          onDone();
          router.push('/cards');
        }}
        accessibilityRole="button">
        <PlusIcon size={18} color={colors.peachInk} weight="bold" />
        <Text style={s.addText}>Добавить карту</Text>
      </Tap>
    </View>
  );
}

const done = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

function Field({ value, onChange, placeholder, keyboard, autoFocus, warn }: { value: string; onChange: (t: string) => void; placeholder: string; keyboard?: 'phone-pad' | 'number-pad'; autoFocus?: boolean; warn?: boolean }) {
  return (
    <View style={[s.field, warn && s.fieldWarn]}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.mut2} keyboardType={keyboard} autoFocus={autoFocus} style={s.input} accessibilityLabel={placeholder} />
    </View>
  );
}

function Save({ label = 'Сохранить', off, onPress }: { label?: string; off?: boolean; onPress: () => void }): ReactNode {
  return (
    <Tap style={[s.save, off && { opacity: 0.4 }]} disabled={off} onPress={onPress} accessibilityRole="button">
      <Text style={s.saveText}>{label}</Text>
    </Tap>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingHorizontal: 4 },
  hint: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut, paddingHorizontal: 4, marginTop: -4 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut, paddingHorizontal: 4 },
  warn: { fontSize: 13, fontFamily: fonts.semibold, color: colors.coralLink, paddingHorizontal: 4, marginTop: -4 },
  field: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 14, borderWidth: 2, borderColor: 'transparent' },
  fieldWarn: { borderColor: colors.coralAction },
  input: { minHeight: 50, fontSize: 16.5, fontFamily: fonts.medium, color: colors.fg },
  save: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 20, paddingRight: 16, borderWidth: 2, borderColor: 'transparent' },
  cardOn: { borderColor: colors.coralAction },
  cardTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  chip: { width: 40, height: 28, borderRadius: 6 },
  cardTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  cardSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, backgroundColor: colors.peach },
  addText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.peachInk },
});
