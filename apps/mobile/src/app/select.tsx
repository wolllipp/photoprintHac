/**
 * Путь Б, шаг 3 — «Отбор фото»: что выбрал ИИ и почему; любое фото можно вернуть или убрать касанием.
 * В продукте — GET/PATCH /projects/{id}/selection.
 */
import { router } from 'expo-router';
import { CheckIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Photo, Tap } from '@/components/ui';
import { colors, fonts, type PhotoKey } from '@/theme';

const GRID: { k: PhotoKey; on: boolean }[] = [
  { k: 'g1', on: true }, { k: 'g2', on: true }, { k: 'g3', on: false }, { k: 'g6', on: true },
  { k: 'g4', on: true }, { k: 'g5', on: false }, { k: 'g2', on: true }, { k: 'g1', on: false },
  { k: 'g6', on: true }, { k: 'g3', on: true }, { k: 'g4', on: false }, { k: 'g5', on: true },
];
const BASE = 38; // столько выбрал ИИ из 214
const BASE_ON = GRID.filter((g) => g.on).length;

export default function Select() {
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState(GRID.map((g) => g.on));
  const count = BASE + sel.filter(Boolean).length - BASE_ON;

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="Отбор фото" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <View style={s.headRow}>
            <Text style={s.small}>Выбрано для книги</Text>
            <Text style={s.small}>4 главы</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessibilityLiveRegion="polite">
            <Text style={s.big}>{count}</Text>
            <Text style={s.of}>из 214 фото</Text>
          </View>
          <View style={s.grid}>
            {GRID.map((g, i) => (
              <Tap
                key={i}
                style={s.cell}
                onPress={() => setSel((v) => v.map((x, j) => (j === i ? !x : x)))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel[i] }}
                accessibilityLabel={`Фото ${i + 1}`}>
                <Photo k={g.k} style={[StyleSheet.absoluteFill, { borderRadius: 4 }, !sel[i] && { opacity: 0.35 }]} />
                {sel[i] ? (
                  <View style={s.check}><CheckIcon size={11} color="#fff" weight="bold" /></View>
                ) : null}
              </Tap>
            ))}
          </View>
        </View>

        <View style={s.stats}>
          <Stat n="−41" label="дубли и серии" />
          <Stat n="−17" label="смазанные и тёмные" />
          <Stat n="−23" label="скриншоты" />
        </View>

        <View style={s.hint}>
          <Text style={s.hintText}>
            Из 133 похожих пейзажей оставили самые разные. <Text style={{ fontFamily: fonts.bold }}>Любое фото можно вернуть</Text> — нажмите на него.
          </Text>
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={() => router.replace({ pathname: '/book/[id]', params: { id: 'karelia' } })} accessibilityRole="button">
          <Text style={s.ctaText}>Смотреть книгу</Text>
        </Tap>
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, gap: 14, paddingBottom: 16 },
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 12 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  big: { fontSize: 44, fontFamily: fonts.display, letterSpacing: -1.3, color: colors.fg, fontVariant: ['tabular-nums'] },
  of: { fontSize: 17, fontFamily: fonts.regular, color: colors.mut },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  cell: { width: '24.2%', aspectRatio: 1 },
  check: {
    position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.coralAction, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', gap: 2 },
  statN: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg, fontVariant: ['tabular-nums'] },
  statL: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, textAlign: 'center' },
  hint: { backgroundColor: colors.tealTint, borderRadius: 20, padding: 14 },
  hintText: { fontSize: 14, fontFamily: fonts.regular, lineHeight: 20, color: colors.fg },
  bottom: { paddingHorizontal: 18, paddingTop: 10 },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
