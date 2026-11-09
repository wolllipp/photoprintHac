/**
 * Пики: баланс, сколько это в рублях, как получить и как потратить, история.
 * Открывается по пилюле с пиками в шапке главной. «Позвать друга» живёт здесь.
 */
import * as Haptics from 'expo-haptics';
import { CakeIcon, ChatCircleTextIcon, ShoppingBagIcon, UserPlusIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Pik, Tap } from '@/components/ui';
import { PIK_RATE, pikHistory } from '@/data/demo';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Points() {
  const insets = useSafeAreaInsets();
  const { points } = useStore();

  const invite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Share.share({ message: 'Собираю фотокниги в picPac — держи 100 пиков на первый заказ: https://picpac.by/i/ivan' }).catch(() => {});
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}>
        <Animated.View entering={enterItem(0)} style={s.balance}>
          <Text style={s.label}>Ваши пики</Text>
          <View style={s.balRow}>
            <AnimatedNumber value={points} format={String} style={s.balNum} />
            <Pik size={40} />
          </View>
          <Text style={s.balSub}>≈ {rub(points * PIK_RATE)} скидки на следующий заказ</Text>
        </Animated.View>

        <Animated.View entering={enterItem(1)} style={{ gap: 10 }}>
          <Text style={s.h2}>Как получить</Text>
          <View style={s.group}>
            <Way icon={<UserPlusIcon size={20} color={colors.peachInk} weight="fill" />} title="Позвать друга" sub="когда друг сделает первый заказ" amount="+100" onPress={invite} />
            <Way icon={<ChatCircleTextIcon size={20} color={colors.peachInk} weight="fill" />} title="Отзыв о книге" sub="после получения заказа" amount="+50" />
            <Way icon={<CakeIcon size={20} color={colors.peachInk} weight="fill" />} title="В день рождения" sub="подарок раз в год" amount="+200" />
          </View>
        </Animated.View>

        <Animated.View entering={enterItem(2)} style={{ gap: 10 }}>
          <Text style={s.h2}>Как потратить</Text>
          <View style={[s.group, s.spend]}>
            <View style={s.ico}><ShoppingBagIcon size={20} color={colors.peachInk} weight="fill" /></View>
            <Text style={s.spendText}>Списывайте при оформлении — переключатель «Списать пики» перед оплатой. 1 пик = {rub(PIK_RATE)}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={enterItem(3)} style={{ gap: 10 }}>
          <Text style={s.h2}>История</Text>
          <View style={s.group}>
            {pikHistory.map((h) => (
              <View key={h.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{h.title}</Text>
                  <Text style={s.rowSub}>{h.sub}</Text>
                </View>
                <Text style={[s.amount, h.amount > 0 && { color: colors.tealInk }]}>{h.amount > 0 ? `+${h.amount}` : `−${-h.amount}`}</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={invite} accessibilityRole="button">
          <Text style={s.ctaText}>Позвать друга · +100</Text>
          <Pik size={22} />
        </Tap>
      </View>
    </View>
  );
}

function Way({ icon, title, sub, amount, onPress }: { icon: ReactNode; title: string; sub: string; amount: string; onPress?: () => void }) {
  return (
    <Tap style={s.row} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'}>
      <View style={s.ico}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      <Text style={s.plus}>{amount}</Text>
    </Tap>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 18 },
  balance: { backgroundColor: colors.peach, borderRadius: 26, padding: 20, gap: 4 },
  label: { fontSize: 14, fontFamily: fonts.semibold, color: colors.peachInk },
  balRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balNum: { fontSize: 56, lineHeight: 64, fontFamily: fonts.display, letterSpacing: -2, color: colors.fg },
  balSub: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  h2: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  group: { backgroundColor: colors.card, borderRadius: 26, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  ico: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  plus: { fontSize: 17, fontFamily: fonts.display, color: colors.coralAction },
  amount: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg, fontVariant: ['tabular-nums'] },
  spend: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  spendText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.fg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
