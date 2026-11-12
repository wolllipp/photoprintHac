/**
 * Фотопечать (A7): формат, бумага, сколько копий каждого фото — цена считается сразу.
 * По умолчанию 10×15, глянец, по одной копии. Кадры, которые не совпадают с форматом по пропорции,
 * отмечены пунктиром «обрежем края» — и подсказка, на какой формат они лягут без обрезки.
 * Фото с количеством 0 в заказ не идут. «Заказать» — сразу на оформление, как у книг.
 * Если пришли из чата с близкими — печатаем выбранные там фото (параметр photos, JSON-массив).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { MinusIcon, PlusIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TitleBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { photos, pic, type Pic, type PhotoName } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

// цены — с сайта (цифровая печать, от 0,49 р.); источник правды — справочник D14
const FORMATS = [
  { id: '10×15', price: 0.49 },
  { id: '15×21', price: 1.2 },
  { id: '20×30', price: 2.9 },
];
const PAPERS = [
  { id: 'Глянец', title: 'глянцевая', sub: 'яркие цвета, насыщенный чёрный' },
  { id: 'Мат', title: 'матовая', sub: 'без бликов и отпечатков пальцев' },
] as const;
const ALL = Object.keys(photos) as PhotoName[];
// shortcut: «квадратные» кадры отмечены вручную; в продукте — пропорция файла против пропорции формата (A8)
const SQUARE = new Set<Pic>(['cafe-dessert', 'birthday-cake']);

function parseShots(raw?: string): Pic[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(v) && v.length ? v.filter((x): x is string => typeof x === 'string') : ALL;
  } catch {
    return ALL;
  }
}
const GAP = 8;

export default function Print() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { orderNow } = useStore();
  const params = useLocalSearchParams<{ photos?: string }>();
  // фото — те, что выбрали в галерее (или в чате/книге); можно добавить ещё
  const [SHOTS, setShots] = useState(() => parseShots(params.photos));
  const addMore = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    if (res.canceled || !res.assets.length) return;
    const fresh = res.assets.map((a) => a.uri).filter((u) => !SHOTS.includes(u));
    setShots((x) => [...x, ...fresh]);
    setQty((q) => ({ ...q, ...Object.fromEntries(fresh.map((u) => [u, 1])) }));
  };
  const [format, setFormat] = useState(FORMATS[0]);
  const [fit, setFit] = useState<'crop' | 'fields'>('crop');
  const [paper, setPaper] = useState<(typeof PAPERS)[number]['id']>('Глянец');
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(SHOTS.map((k) => [k, 1])));
  const count = SHOTS.reduce((a, k) => a + qty[k], 0);
  const total = Math.round(count * format.price * 100) / 100;
  const cropped = SHOTS.filter((k) => qty[k] > 0 && SQUARE.has(k)).length;
  const cell = Math.floor((width - 32 - 28 - GAP * 2) / 3);

  const change = (k: string, d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setQty((q) => ({ ...q, [k]: Math.max(0, Math.min(20, q[k] + d)) }));
  };
  const all = (n: number) => {
    Haptics.selectionAsync().catch(() => {});
    setQty(Object.fromEntries(SHOTS.map((k) => [k, n])));
  };

  const onOrder = () => {
    if (!count) return;
    const first = SHOTS.find((k) => qty[k] > 0) ?? SHOTS[0];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    orderNow({
      projectId: `print-${format.id}`,
      title: `Фотопечать ${format.id}`,
      tariff: 'print',
      tariffName: 'Фото',
      format: format.id,
      pages: count,
      finish: paper === 'Мат' ? 'Зерно' : 'Глянец',
      price: total,
      readyBy: 'завтра',
      cover: first,
    });
    router.push('/checkout');
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <TitleBar title="Фотопечать" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>

        {/* формат */}
        <View style={s.section}>
          <Text style={s.label}>Формат</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {FORMATS.map((f) => {
              const on = f.id === format.id;
              return (
                <Tap
                  key={f.id}
                  style={[s.fmt, on && s.fmtOn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFormat(f);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}>
                  <Text style={[s.fmtName, on && { color: '#fff' }]}>{f.id}</Text>
                  <Text style={[s.fmtPrice, on && { color: 'rgba(255,255,255,0.8)' }]}>{rub(f.price)}</Text>
                </Tap>
              );
            })}
          </View>
          {/* кадры другой пропорции — решение, а не предупреждение: обрезать или напечатать с полями */}
          {cropped ? (
            <View style={s.fit}>
              <View style={s.fitHead}>
                <View style={s.fitThumbs}>
                  {SHOTS.filter((k) => SQUARE.has(k)).map((k, i) => (
                    <Image key={k} source={pic(k)} style={[s.fitThumb, { marginLeft: i ? -12 : 0, zIndex: 3 - i }]} contentFit="cover" />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fitTitle}>
                    {cropped} {cropped === 1 ? 'кадр' : 'кадра'} другой пропорции
                  </Text>
                  <Text style={s.fitSub}>{fit === 'crop' ? 'Обрежем края — снимок на весь лист' : 'Весь снимок, по бокам белые поля'}</Text>
                </View>
              </View>
              <View style={s.row} accessibilityRole="radiogroup">
                {(
                  [
                    ['crop', 'Обрезать края'],
                    ['fields', 'С полями'],
                  ] as const
                ).map(([id, label]) => (
                  <Tap
                    key={id}
                    style={[s.fitChip, fit === id && s.fitChipOn]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setFit(id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: fit === id }}>
                    <Text style={[s.fitChipText, fit === id && { color: '#fff' }]}>{label}</Text>
                  </Tap>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* бумага */}
        <View style={s.section}>
          <Text style={s.label}>Бумага</Text>
          <View style={s.row} accessibilityRole="radiogroup">
            {PAPERS.map((p) => {
              const on = p.id === paper;
              return (
                <Tap
                  key={p.id}
                  style={[s.paper, on && s.paperOn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setPaper(p.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Бумага ${p.title}: ${p.sub}`}>
                  {/* образец: тот же снимок на глянцевой бумаге (яркий, с бликом) и на матовой (мягкий, без блика) */}
                  <View style={s.swatch}>
                    <Image source={pic('city-sunset')} style={StyleSheet.absoluteFill} contentFit="cover" />
                    {p.id === 'Глянец' ? (
                      <LinearGradient
                        colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0)', 'rgba(255,255,255,0.18)']}
                        locations={[0, 0.32, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, s.matte]} />
                    )}
                  </View>
                  <Text style={s.paperName}>{p.title}</Text>
                  <Text style={s.paperSub}>{p.sub}</Text>
                </Tap>
              );
            })}
          </View>
        </View>

        {/* фото: у каждого — сколько копий */}
        <View style={s.section}>
          <Text style={s.label}>{SHOTS.length} фото · копий каждого</Text>
          {/* быстро задать всем сразу — пилюли; потом можно поправить у отдельных фото */}
          <View style={s.row} accessibilityRole="radiogroup">
            {[1, 2, 3, 5].map((n) => {
              const on = SHOTS.every((k) => qty[k] === n);
              return (
                <Tap key={n} style={[s.allChip, on && s.allChipOn]} onPress={() => all(n)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`По ${n} копии каждого`}>
                  <Text style={[s.allChipText, on && { color: '#fff' }]}>по {n}</Text>
                </Tap>
              );
            })}
          </View>
          <View style={s.grid}>
            {SHOTS.map((k) => (
              <View key={k} style={{ width: cell, gap: 6 }}>
                <View style={[s.photo, { width: cell, height: cell }, qty[k] === 0 && { opacity: 0.35 }]}>
                  {SQUARE.has(k) && fit === 'fields' ? (
                    // с полями: весь снимок по центру, по бокам белое
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', paddingHorizontal: '14%' }]}>
                      <Image source={pic(k)} style={{ flex: 1 }} contentFit="cover" />
                    </View>
                  ) : (
                    <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
                  )}
                  {SQUARE.has(k) && fit === 'crop' && qty[k] > 0 ? <View style={s.crop} pointerEvents="none" /> : null}
                </View>
                <Stepper value={qty[k]} onMinus={() => change(k, -1)} onPlus={() => change(k, 1)} min={0} small />
              </View>
            ))}
            {/* добавить ещё фото из галереи */}
            <Tap style={[s.add, { width: cell, height: cell }]} onPress={() => addMore().catch(() => {})} accessibilityRole="button" accessibilityLabel="Добавить фото из галереи">
              <PlusIcon size={22} color={colors.peachInk} weight="bold" />
              <Text style={s.addText}>Добавить{'\n'}из галереи</Text>
            </Tap>
          </View>
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={[s.cta, !count && { opacity: 0.4 }]} onPress={onOrder} disabled={!count} accessibilityRole="button" accessibilityLabel={`Заказать ${count} фото, ${rub(total)}`}>
          <Text style={s.ctaText}>Заказать · {count} фото</Text>
          <View style={s.ctaSum}>
            <AnimatedNumber value={total} format={rub} style={s.ctaPrice} />
          </View>
        </Tap>
      </View>
    </View>
  );
}

function Stepper({ value, onMinus, onPlus, min, small }: { value: number; onMinus: () => void; onPlus: () => void; min: number; small?: boolean }) {
  const size = small ? 28 : 34;
  return (
    <View style={[s.stepper, small && { alignSelf: 'stretch', justifyContent: 'space-between' }]}>
      <Tap style={[s.step, { width: size, height: size }]} onPress={onMinus} disabled={value <= min} accessibilityRole="button" accessibilityLabel="Меньше">
        <MinusIcon size={13} color={value <= min ? colors.mut2 : colors.fg} weight="bold" />
      </Tap>
      <Text style={[s.stepN, value === 0 && { color: colors.mut2 }]}>{value}</Text>
      <Tap style={[s.step, { width: size, height: size }]} onPress={onPlus} accessibilityRole="button" accessibilityLabel="Больше">
        <PlusIcon size={13} color={colors.fg} weight="bold" />
      </Tap>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  section: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 10 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  row: { flexDirection: 'row', gap: 6 },
  fmt: { flex: 1, borderRadius: 18, backgroundColor: '#fff', paddingVertical: 12, alignItems: 'center', gap: 2 },
  fmtOn: { backgroundColor: colors.coralAction },
  fmtName: { fontSize: 17, fontFamily: fonts.display, color: colors.fg },
  fmtPrice: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  fit: { backgroundColor: '#fff', borderRadius: 18, padding: 12, gap: 10 },
  fitHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fitThumbs: { flexDirection: 'row' },
  fitThumb: { width: 40, height: 40, borderRadius: 10, borderWidth: 2, borderColor: '#fff' },
  fitTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  fitSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  fitChip: { flex: 1, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  fitChipOn: { backgroundColor: colors.coralAction },
  fitChipText: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.fg },
  paper: { flex: 1, borderRadius: 18, backgroundColor: '#fff', padding: 10, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  add: { borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.peachStrong, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center', gap: 6 },
  addText: { fontSize: 12, lineHeight: 15, fontFamily: fonts.semibold, color: colors.peachInk, textAlign: 'center' },
  swatch: { height: 74, borderRadius: 10, overflow: 'hidden', marginBottom: 8, backgroundColor: colors.card2 },
  matte: { backgroundColor: 'rgba(240,236,230,0.32)' },
  paperOn: { borderColor: colors.coralAction },
  paperName: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  paperSub: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.regular, color: colors.mut },
  allChip: { flex: 1, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  allChipOn: { backgroundColor: colors.coralAction },
  allChipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  photo: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card2 },
  crop: { position: 'absolute', left: '14%', right: '14%', top: 0, bottom: 0, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderStyle: 'dashed', borderColor: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 2 },
  step: { borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepN: { minWidth: 22, textAlign: 'center', fontSize: 14, fontFamily: fonts.bold, color: colors.fg, fontVariant: ['tabular-nums'] },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 58, borderRadius: 29, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 8 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  ctaSum: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  ctaPrice: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: '#fff' },
});
