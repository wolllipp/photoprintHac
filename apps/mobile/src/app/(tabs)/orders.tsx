import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/** Заказы — следующий шаг (экран «Отслеживание» в journey.html). */
export default function Orders() {
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Заказы</Text>
      <Text style={s.sub}>Скоро здесь будет отслеживание</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '700', color: colors.fg },
  sub: { fontSize: 15, color: colors.mut },
});
