/**
 * Профиль и настройки (открывается по аватару). Пока одна настройка — приветственный экран на главной.
 */
import { router } from 'expo-router';
import { XIcon } from 'phosphor-react-native';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { showIntro, setShowIntro } = useStore();
  return (
    <View style={[s.screen, { paddingTop: insets.top + 8 }]}>
      <View style={s.nav}>
        <View style={{ width: 36 }} />
        <Text style={s.navTitle}>Настройки</Text>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>
      <View style={s.group}>
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Приветственный экран</Text>
            <Text style={s.sub}>Фото на весь экран при открытии. Выключите — главная откроется сразу с плитками</Text>
          </View>
          <Switch
            value={showIntro}
            onValueChange={setShowIntro}
            trackColor={{ true: colors.coralAction, false: colors.card2 }}
            thumbColor="#fff"
            ios_backgroundColor={colors.card2}
            accessibilityLabel="Приветственный экран"
          />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, gap: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navTitle: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: colors.card, borderRadius: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  title: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  sub: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, marginTop: 3 },
});
