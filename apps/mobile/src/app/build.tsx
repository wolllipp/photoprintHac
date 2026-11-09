/**
 * Путь Б, шаг 2 — «Собираем книгу»: этапы работы ИИ вместо крутящегося круга, можно остановить.
 * Этапы и прогресс в продукте приходят из GET /jobs/{id} (build_jobs). Здесь — таймер (DEMO_MODE).
 */
import { router } from 'expo-router';
import { CheckIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Photo, Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

const STEPS = [
  { title: 'Отбираем лучшие кадры', done: '38 из 214' },
  { title: 'Раскладываем по главам', done: '4 главы' },
  { title: 'Проверяем лица и обрез', done: 'всё в норме' },
  { title: 'Подбираем подписи', done: 'готово' },
];
const STEP_MS = 1100;

export default function Build() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= STEPS.length) {
      const t = setTimeout(() => router.replace('/select'), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((x) => x + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <View style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 12 }]}>
      <NavBar title="Карелия, июль" />
      <View style={s.body}>
        <View style={s.collage}>
          <Photo k="g2" style={{ flex: 1.3, borderRadius: 14 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Photo k="g6" style={{ flex: 1, borderRadius: 14 }} />
            <Photo k="g3" style={{ flex: 1, borderRadius: 14 }} />
          </View>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }} accessibilityLiveRegion="polite">
          <Text style={s.title}>{step >= STEPS.length ? 'Книга готова' : 'Собираем книгу'}</Text>
          <Text style={s.sub}>обычно до 30 секунд</Text>
        </View>
        <View style={s.card}>
          {STEPS.map((st, i) => {
            const done = i < step;
            const now = i === step;
            return (
              <View key={st.title} style={[s.row, !done && !now && { opacity: 0.45 }]}>
                {done ? (
                  <View style={s.ok}><CheckIcon size={12} color="#fff" weight="bold" /></View>
                ) : now ? (
                  <ActivityIndicator size="small" color={colors.coralAction} style={{ width: 24 }} />
                ) : (
                  <View style={s.wait} />
                )}
                <Text style={s.rowText}>{st.title}</Text>
                {done ? <Text style={s.rowMeta}>{st.done}</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
      <Tap style={s.stop} onPress={() => router.back()} accessibilityRole="button">
        <Text style={s.stopText}>Остановить</Text>
      </Tap>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: 18, gap: 22, paddingTop: 8 },
  collage: { height: 190, flexDirection: 'row', gap: 6, paddingHorizontal: 6 },
  title: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },
  sub: { fontSize: 15, fontFamily: fonts.regular, color: colors.mut },
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ok: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  wait: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.card2 },
  rowText: { flex: 1, fontSize: 16, fontFamily: fonts.regular, color: colors.fg },
  rowMeta: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  stop: { height: 54, borderRadius: 27, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  stopText: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
});
