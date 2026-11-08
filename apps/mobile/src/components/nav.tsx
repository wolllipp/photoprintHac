import { router } from 'expo-router';
import { CaretLeftIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Tap } from '@/components/ui';
import { colors } from '@/theme';

/** Шапка вложенного экрана: «назад», заголовок по центру, необязательное действие справа. */
export function NavBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={s.nav}>
      <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
        <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
      </Tap>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      {right ?? <View style={{ width: 36 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8, gap: 10 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.fg },
});
