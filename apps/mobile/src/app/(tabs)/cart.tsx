/**
 * Корзина: что лежит и кнопка «Оформить». Пустое состояние ведёт к сборке книги.
 */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Photo, Tap } from '@/components/ui';
import { rub, useStore } from '@/data/store';
import { colors } from '@/theme';

export default function Cart() {
  const insets = useSafeAreaInsets();
  const { cart } = useStore();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }]}>
      <Text style={s.title}>Корзина</Text>
      {cart.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>Здесь пока пусто. Готовые черновики ждут на главной.</Text>
          <Tap style={s.btn} onPress={() => router.navigate('/')} accessibilityRole="button">
            <Text style={s.btnText}>Посмотреть черновики</Text>
          </Tap>
        </View>
      ) : (
        <>
          <View style={s.group}>
            {cart.map((it) => (
              <View key={it.id} style={s.row}>
                <Photo k={it.cover} style={s.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{it.title}</Text>
                  <Text style={s.rowSub}>{it.tariffName} {it.format} · {it.pages} страницы · будет {it.readyBy}</Text>
                </View>
                <Text style={s.value}>{rub(it.price)}</Text>
              </View>
            ))}
          </View>
          <Tap style={s.btn} onPress={() => router.push('/checkout')} accessibilityRole="button">
            <Text style={s.btnText}>Оформить</Text>
          </Tap>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 16 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.75, color: colors.fg, paddingTop: 6 },
  empty: { gap: 14, paddingTop: 24, alignItems: 'flex-start' },
  emptyText: { fontSize: 16, lineHeight: 22, color: colors.mut },
  group: { backgroundColor: colors.card, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.fg },
  rowSub: { fontSize: 13, color: colors.mut, marginTop: 1 },
  value: { fontSize: 16, fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
  btn: { height: 52, paddingHorizontal: 22, borderRadius: 16, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  btnText: { fontSize: 17, fontWeight: '600', color: '#fff' },
});
