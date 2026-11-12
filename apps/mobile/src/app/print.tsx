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
import { ImagesIcon, MinusIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TitleBar } from '@/components/nav';
import { PRINT_FORMATS, PRINTS_DAYS } from '@/data/demo';
import { Tap } from '@/components/ui';
import { photos, pic, type Pic, type PhotoName } from '@/data/photos';
import { dupText, pickPhotos } from '@/data/picked';
import { rub, useStore } from '@/data/store';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

// цены — из каталога сервера (super.picpac.by/catalog/photo: глянец и мат по одной цене), см. api/catalog.ts
const FORMATS = PRINT_FORMATS;
const PAPERS = [
  { id: 'Глянец', title: 'Глянцевая', sub: 'яркие цвета, насыщенный чёрный' },
  { id: 'Мат', title: 'Матовая', sub: 'без бликов и отпечатков пальцев' },
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
  // убрать фото из печати (с «Вернуть» на несколько секунд)
  const [removed, setRemoved] = useState<{ k: Pic; at: number; n: number } | null>(null);
  const remove = (k: Pic) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRemoved({ k, at: SHOTS.indexOf(k), n: qty[k] ?? 1 });
    setShots((x) => x.filter((y) => y !== k));
  };
  const restore = () => {
    if (!removed) return;
    setShots((x) => [...x.slice(0, removed.at), removed.k, ...x.slice(removed.at)]);
    setQty((q) => ({ ...q, [removed.k]: removed.n }));
    setRemoved(null);
  };
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved(null), 4000);
    return () => clearTimeout(t);
  }, [removed]);
  // уже выбранные снимки повторно не добавляем; сколько пропустили — говорим внизу
  const [notice, setNotice] = useState<string | null>(null);
  const addMore = async () => {
    const picked = await pickPhotos(SHOTS);
    if (!picked) return;
    setShots((x) => [...x, ...picked.fresh]);
    setQty((q) => ({ ...q, ...Object.fromEntries(picked.fresh.map((u) => [u, 1])) }));
    if (picked.dup) setNotice(dupText(picked.dup));
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const [format, setFormat] = useState(FORMATS[0]);
  const [fit, setFit] = useState<'crop' | 'fields'>('crop');
  const [paper, setPaper] = useState<(typeof PAPERS)[number]['id']>('Глянец');
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(SHOTS.map((k) => [k, 1])));
  const count = SHOTS.reduce((a, k) => a + (qty[k] ?? 0), 0);
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
      readyBy: `через ${PRINTS_DAYS} ${PRINTS_DAYS === 1 ? 'день' : PRINTS_DAYS < 5 ? 'дня' : 'дней'}`,
      cover: first,
      // для заказа на сервере: какие фото и сколько копий (демо-снимки на сервер не уходят)
      prints: SHOTS.filter((k) => (qty[k] ?? 0) > 0).map((k) => ({ uri: String(k), qty: qty[k] })),
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
                  <Text style={[s.allChipText, on && { color: '#fff' }]}>По {n}</Text>
                </Tap>
              );
            })}
          </View>
          <View style={s.grid}>
            {SHOTS.map((k) => (
              <Animated.View key={k} exiting={ZoomOut.duration(180)} layout={LinearTransition.duration(240)} style={{ width: cell, gap: 6 }}>
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
                  {/* выбрали лишнее — крестик убирает фото из печати совсем */}
                  <Tap style={s.remove} onPress={() => remove(k)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Убрать фото из печати">
                    <XIcon size={12} color="#fff" weight="bold" />
                  </Tap>
                </View>
                <Stepper value={qty[k]} onMinus={() => change(k, -1)} onPlus={() => change(k, 1)} min={0} small />
              </Animated.View>
            ))}
            {/* добавить ещё фото из галереи */}
            <Tap style={[s.add, { width: cell, height: cell }]} onPress={() => addMore().catch(() => {})} accessibilityRole="button" accessibilityLabel="Добавить фото из галереи">
              {/* значок галереи с плюсом — сразу понятно «добавить фото из галереи» */}
              <View style={s.addIcon}>
                <ImagesIcon size={22} color={colors.fg} weight="bold" />
                <View style={s.addPlus}>
                  <PlusIcon size={10} color="#fff" weight="bold" />
                </View>
              </View>
              <Text style={s.addText}>Ещё фото</Text>
            </Tap>
          </View>
        </View>
      </ScrollView>

      {notice && !removed ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(160)} style={[s.toast, { bottom: insets.bottom + 92 }]}>
          <Text style={[s.toastText, { flex: 1 }]}>{notice}</Text>
        </Animated.View>
      ) : null}
      {removed ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(160)} style={[s.toast, { bottom: insets.bottom + 92 }]}>
          <Text style={s.toastText}>Фото убрано</Text>
          <Tap onPress={restore} hitSlop={10} accessibilityRole="button">
            <Text style={s.toastLink}>Вернуть</Text>
          </Tap>
        </Animated.View>
      ) : null}
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
  remove: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(20,16,14,0.55)', alignItems: 'center', justifyContent: 'center' },
  // уведомление «… · Отменить/Вернуть» — светлое, как карточки приложения: белое, мягкая тень, коралловая ссылка
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(35,43,42,0.08)', paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 8px 24px rgba(40,28,20,0.14)' },
  toastText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  toastLink: { fontSize: 15, fontFamily: fonts.bold, color: colors.coralLink },
  add: { borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  addPlus: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.card, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.fg },
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
