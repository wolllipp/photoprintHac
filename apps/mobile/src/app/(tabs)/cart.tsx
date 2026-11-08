import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/** Корзина — следующий шаг (экран «Оформление» в journey.html). */
export default function Cart() {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Корзина</Text>
      <Text style={s.sub}>Скоро здесь будет оформление заказа</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '700', color: colors.fg },
  sub: { fontSize: 15, color: colors.mut },
});
