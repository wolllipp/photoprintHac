/**
 * Профиль (по аватару на главной): кто вы, «Мои данные» (имя, телефон, доставка по умолчанию, карты — правка листом снизу),
 * переходы к пикам, черновикам и заказам, уведомления,
 * настройки приложения, приватность (обработка фото ИИ, удалить мои фото) и выход.
 * Удаление фото и выход — необратимы, поэтому с подтверждением (apple-design: подтверждать только такое).
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CaretRightIcon, XIcon } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View, Platform } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileEdit, type EditWhat } from '@/components/profileEdit';
import { Pik, Tap } from '@/components/ui';
import { delivery, pickupPoints } from '@/data/demo';
import { features } from '@/data/features';
import { useStore } from '@/data/store';
import { ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { aiConsent, setAiConsent, phone, points, signedIn, orders, name, delivery: pref, cards, cardId } = useStore();
  // что сейчас правим — листом снизу
  const [edit, setEdit] = useState<EditWhat | null>(null);
  const method = delivery.find((d) => d.id === pref.deliveryId) ?? delivery[0];
  const point = pickupPoints.find((p) => p.id === pref.pointId);
  const where = pref.deliveryId === 'evropochta' ? (point ? `${point.title}, ${point.address}` : 'пункт не выбран') : pref.address ? pref.address.street : 'адрес не указан';
  const card = cards.find((c) => c.id === cardId) ?? cards[0];
  const [notify, setNotify] = useState({ status: true, promo: false });
  const [deleted, setDeleted] = useState(false);
  const enter = (i: number) => FadeInDown.delay(50 * i).duration(380).easing(ease.smoothOut);

  const deletePhotos = () =>
    Alert.alert('Удалить все ваши фото?', 'Фото удалятся с наших серверов. Черновики книг пропадут, оформленные заказы допечатаются как есть.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          setDeleted(true);
        },
      },
    ]);
  const logout = () =>
    Alert.alert('Выйти из аккаунта?', 'Черновики и заказы останутся в аккаунте — вернутся, когда войдёте снова.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => router.back() },
    ]);

  return (
    <View style={[s.screen, { paddingTop: Platform.OS === 'ios' ? 16 : insets.top + 12 }]}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {/* кто вы */}
        <Animated.View entering={enter(0)} style={s.me}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>И</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{name}</Text>
            <Text style={s.phone}>{phone}</Text>
          </View>
          <Tap style={[s.round, { alignSelf: 'flex-start' }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
            <XIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
        </Animated.View>

        {/* мои данные — всё, что нужно для заказа, правится здесь */}
        <Text style={s.h2}>Мои данные</Text>
        <Animated.View entering={enter(1)} style={s.group}>
          <Row title="Имя" sub={name} onPress={() => setEdit('name')} />
          <Row title="Телефон" sub={phone} onPress={() => setEdit('phone')} />
          <Row title="Доставка" sub={`${method.title.split(' · ')[0]} · ${where}`} onPress={() => setEdit('delivery')} />
          <Row title="Карты" sub={card ? `${card.brand} •• ${card.last4} · основная${cards.length > 1 ? ` · ещё ${cards.length - 1}` : ''}` : 'не добавлены'} onPress={() => setEdit('cards')} />
        </Animated.View>

        {/* переходы */}
        <Animated.View entering={enter(1)} style={s.group}>
          {/* пики — всем; баланс с сервера (у гостя 0, пока не вошёл по номеру) */}
          <Row title="Пики" sub={signedIn ? 'баллы за друзей и отзывы' : 'войдите по номеру, чтобы копить и тратить'} onPress={() => router.push('/points')} right={<View style={s.pts}><Text style={s.ptsText}>{points}</Text><Pik size={18} /></View>} />
          <Row title="Черновики" sub="незаконченные книги — храним 60 дней" onPress={() => { router.back(); router.navigate('/drafts'); }} />
          <Row
            title="Заказы"
            sub={orders.length ? `${orders.length} · последний «${orders[0].title}»` : 'пока нет'}
            onPress={() => {
              router.back();
              router.navigate('/orders');
            }}
          />
        </Animated.View>

        {/* уведомления */}
        <Text style={s.h2}>Уведомления</Text>
        <Animated.View entering={enter(2)} style={s.group}>
          <Toggle title="Статус заказа" sub="печать, отправка, «можно забирать»" value={notify.status} onChange={(v) => setNotify((n) => ({ ...n, status: v }))} />
          <Toggle title="Скидки и идеи книг" sub="не чаще раза в неделю" value={notify.promo} onChange={(v) => setNotify((n) => ({ ...n, promo: v }))} />
        </Animated.View>

        {/* приватность */}
        <Text style={s.h2}>Ваши фото</Text>
        <Animated.View entering={enter(4)} style={s.group}>
          <Toggle title="Обработка фото ИИ" sub="внутри «Фотопринта», никому не передаём" value={aiConsent} onChange={setAiConsent} />
          {deleted ? (
            <Animated.View entering={FadeIn} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: colors.tealInk }]}>Фото удалены</Text>
                <Text style={s.rowSub}>с наших серверов, без возможности восстановить</Text>
              </View>
            </Animated.View>
          ) : features.deletePhotos ? (
            <Row title="Удалить мои фото" sub="сразу, не дожидаясь 30 дней после заказа" danger onPress={deletePhotos} />
          ) : null}
        </Animated.View>

        <Tap style={s.logout} onPress={logout} accessibilityRole="button">
          <Text style={s.logoutText}>Выйти</Text>
        </Tap>
      </ScrollView>
      {edit ? <ProfileEdit what={edit} onClose={() => setEdit(null)} /> : null}
    </View>
  );
}

function Row({ title, sub, right, danger, onPress }: { title: string; sub?: string; right?: ReactNode; danger?: boolean; onPress: () => void }) {
  return (
    <Tap style={s.row} onPress={onPress} accessibilityRole="button" accessibilityLabel={[title, sub].filter(Boolean).join(', ')}>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowTitle, danger && { color: colors.coralAction }]}>{title}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      {right}
      <CaretRightIcon size={15} color={colors.mut2} weight="bold" />
    </Tap>
  );
}

function Toggle({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          Haptics.selectionAsync().catch(() => {});
          onChange(v);
        }}
        trackColor={{ true: colors.coralAction, false: colors.card2 }}
        thumbColor="#fff"
        ios_backgroundColor={colors.card2}
        accessibilityLabel={title}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, gap: 10 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontFamily: fonts.display, color: colors.peachInk },
  name: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg },
  phone: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut },
  h2: { fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 12 },
  group: { backgroundColor: colors.card, borderRadius: 22, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  pts: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ptsText: { fontSize: 15, fontFamily: fonts.display, color: colors.fg },
  logout: { height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  logoutText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.mut },
});
