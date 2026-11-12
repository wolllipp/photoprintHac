import { router } from 'expo-router';
import { CaretLeftIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

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

/**
 * Заголовок экрана: «назад» и крупное название в одну линию (как на «Фотопечати»). right — действие справа.
 * Одинаковый на всех экранах с крупным заголовком: сборка, отбор фото, пики, общие альбомы, печать.
 */
export function TitleBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.titleBar}>
      <Tap style={s.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
        <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
      </Tap>
      <View style={{ flex: 1 }}>{typeof title === 'string' ? <Text style={s.big} numberOfLines={1} accessibilityRole="header">{title}</Text> : title}</View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  titleBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8, gap: 10 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
});
