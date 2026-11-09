/**
 * Корзина: что лежит, итог и «Оформить». Ниже — готовые черновики: их можно открыть и заказать,
 * поэтому пустая корзина не тупик.
 */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CaretRightIcon } from 'phosphor-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { suggestions } from '@/data/demo';
import { photos } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Cart() {
  const insets = useSafeAreaInsets();
  const { cart } = useStore();
  const total = cart.reduce((a, it) => a + it.price, 0);
  const inCart = new Set(cart.map((it) => it.projectId));
  const drafts = suggestions.filter((d) => !inCart.has(d.id));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 80 }]}>
      <Text style={s.title}>Корзина</Text>

      {cart.length === 0 ? (
        <Text style={s.empty}>Пока пусто. Откройте черновик ниже — он уже собран, осталось выбрать тариф.</Text>
      ) : (
        <>
          <View style={s.group}>
            {cart.map((it, i) => (
              <Animated.View key={it.id} entering={enterItem(i)} style={s.row}>
                <Image source={photos[it.cover]} style={s.thumb} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{it.title}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{it.tariffName} {it.format} · {it.pages} стр. · будет {it.readyBy}</Text>
                </View>
                <Text style={s.value}>{rub(it.price)}</Text>
              </Animated.View>
            ))}
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalL}>Итого</Text>
            <AnimatedNumber value={total} format={rub} style={s.totalR} />
          </View>
          <Tap style={s.btn} onPress={() => router.push('/checkout')} accessibilityRole="button">
            <Text style={s.btnText}>Оформить</Text>
          </Tap>
        </>
      )}

      {drafts.length ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <Text style={s.h2}>Черновики</Text>
          <View style={s.group}>
            {drafts.map((d, i) => (
              <Animated.View key={d.id} entering={enterItem(i + 1)}>
                <Tap
                  style={s.row}
                  onPress={() => router.push({ pathname: '/book/[id]', params: { id: d.id } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.title}, ${d.meta}, открыть черновик`}>
                  <Image source={photos[d.photo]} style={s.thumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{d.title}</Text>
                    <Text style={s.rowSub} numberOfLines={1}>{d.meta}</Text>
                  </View>
                  <CaretRightIcon size={16} color={colors.mut} weight="bold" />
                </Tap>
              </Animated.View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 36, lineHeight: 42, fontFamily: fonts.display, letterSpacing: -0.9, color: colors.fg, paddingTop: 6 },
  h2: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  empty: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },
  group: { backgroundColor: colors.card, borderRadius: 26, paddingVertical: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 7 },
  thumb: { width: 56, height: 56, borderRadius: 14 },
  rowTitle: { fontSize: 17, lineHeight: 21, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut },
  value: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg, fontVariant: ['tabular-nums'] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  totalL: { fontSize: 17, fontFamily: fonts.semibold, color: colors.mut },
  totalR: { fontSize: 24, fontFamily: fonts.display, color: colors.fg },
  btn: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
