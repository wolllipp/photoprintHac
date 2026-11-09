/**
 * Фотопечать: какие фото, какой формат, сколько копий — цена считается сразу, дальше обычное оформление.
 */
import { Image } from 'expo-image';
import { MinusIcon, PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { AddedToast, useAdded } from '@/components/added';
import { Tap } from '@/components/ui';
import { type PhotoName, photos, pic } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

// цены иллюстративные, как у тарифов книг; источник правды — справочник D14
const FORMATS = [
  { id: '10×15', price: 0.49 },
  { id: '15×21', price: 1.2 },
  { id: '20×30', price: 2.9 },
];
const SHOTS = Object.keys(photos) as PhotoName[];

export default function Print() {
  const insets = useSafeAreaInsets();
  const { addToCart } = useStore();
  const [format, setFormat] = useState(FORMATS[0]);
  const [copies, setCopies] = useState(1);
  const count = SHOTS.length * copies;
  const total = Math.round(count * format.price * 100) / 100;

  const added = useAdded();
  const onAdd = () => {
    addToCart({
      projectId: `print-${format.id}`,
      title: `Фотопечать ${format.id}`,
      tariff: 'print',
      tariffName: 'Фото',
      format: format.id,
      pages: count,
      finish: 'Глянец',
      price: total,
      readyBy: 'завтра',
      cover: SHOTS[0],
    });
    added.show(`Фотопечать ${format.id} · ${count} фото`, SHOTS[0]);
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="Фотопечать" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}>
        <View style={s.card}>
          <Text style={s.label}>{SHOTS.length} фото из галереи</Text>
          <View style={s.grid}>
            {SHOTS.map((k) => (
              <Image key={k} source={pic(k)} style={s.cell} contentFit="cover" />
            ))}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Формат</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {FORMATS.map((f) => {
              const on = f.id === format.id;
              return (
                <Tap key={f.id} style={[s.fmt, on && s.fmtOn]} onPress={() => setFormat(f)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <Text style={[s.fmtName, on && { color: '#fff' }]}>{f.id}</Text>
                  <Text style={[s.fmtPrice, on && { color: 'rgba(255,255,255,0.8)' }]}>{rub(f.price)}</Text>
                </Tap>
              );
            })}
          </View>

          <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }]}>
            <Text style={s.copiesL}>Копий каждого</Text>
            <View style={s.stepper}>
              <Tap style={s.step} onPress={() => setCopies((c) => Math.max(1, c - 1))} disabled={copies === 1} accessibilityRole="button" accessibilityLabel="Меньше копий">
                <MinusIcon size={16} color={copies === 1 ? colors.mut2 : colors.fg} weight="bold" />
              </Tap>
              <Text style={s.copies} accessibilityLiveRegion="polite">{copies}</Text>
              <Tap style={s.step} onPress={() => setCopies((c) => Math.min(10, c + 1))} accessibilityRole="button" accessibilityLabel="Больше копий">
                <PlusIcon size={16} color={colors.fg} weight="bold" />
              </Tap>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={onAdd} accessibilityRole="button">
          <Text style={s.ctaText}>В корзину · {count} фото · </Text>
          <AnimatedNumber value={total} format={rub} style={s.ctaText} />
        </Tap>
      </View>
      <AddedToast shown={added.shown} bottom={insets.bottom + 80} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 10 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '24%', aspectRatio: 1, borderRadius: 8 },
  row: { flexDirection: 'row', gap: 6 },
  fmt: { flex: 1, borderRadius: 18, backgroundColor: colors.bg, paddingVertical: 12, alignItems: 'center', gap: 2 },
  fmtOn: { backgroundColor: colors.fg },
  fmtName: { fontSize: 17, fontFamily: fonts.display, color: colors.fg },
  fmtPrice: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  copiesL: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bg, borderRadius: 22, padding: 3 },
  step: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  copies: { minWidth: 24, textAlign: 'center', fontSize: 17, fontFamily: fonts.bold, color: colors.fg, fontVariant: ['tabular-nums'] },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
