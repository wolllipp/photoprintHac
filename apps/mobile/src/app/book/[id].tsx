/**
 * «Книга и цена» (путь А): книга на сцене, параметры и цена в шторке, тарифы — как в Яндекс Go.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CaretLeftIcon, CheckIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Photo, Tap } from '@/components/ui';
import { drafts, tariffs, type Tariff } from '@/data/demo';
import { rub, useStore } from '@/data/store';
import { colors } from '@/theme';

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const draft = drafts[id ?? 'karelia'] ?? drafts.karelia;
  const insets = useSafeAreaInsets();
  const { addToCart } = useStore();
  const [tariff, setTariff] = useState<Tariff>(tariffs[1]);
  const [finish, setFinish] = useState<'Глянец' | 'Зерно'>('Глянец');

  const onAdd = () => {
    addToCart({
      projectId: id ?? 'karelia',
      title: draft.title,
      tariff: tariff.id,
      tariffName: tariff.name,
      format: draft.format,
      pages: draft.pages,
      finish,
      price: tariff.price,
      readyBy: tariff.readyBy,
      cover: 'g1',
    });
    router.push('/checkout');
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.nav}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
          <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
        <Text style={s.navTitle} numberOfLines={1}>{draft.title}</Text>
        <Tap style={[s.round, s.edit]} accessibilityRole="button">
          <Text style={s.editText}>Править</Text>
        </Tap>
      </View>

      {/* сцена: разворот книги */}
      <View style={s.stage}>
        <View style={s.spread}>
          <View style={[s.leaf, s.leafLeft]}>
            <Photo k="g1" style={{ flex: 1.4, borderRadius: 4 }} />
            <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
              <Photo k="g3" style={{ flex: 1, borderRadius: 4 }} />
              <Photo k="g5" style={{ flex: 1, borderRadius: 4 }} />
            </View>
          </View>
          <View style={[s.leaf, s.leafRight]}>
            <Photo k="g2" style={{ flex: 1.2, borderRadius: 4 }} />
            <Photo k="g4" style={{ flex: 1, borderRadius: 4 }} />
          </View>
        </View>
        <View style={s.okPill} accessibilityRole="text">
          <View style={s.okDot}><CheckIcon size={12} color="#fff" weight="bold" /></View>
          <Text style={s.okText}>Лица в кадре · резкость в норме</Text>
        </View>
      </View>

      {/* шторка */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={s.grab} />
        <View style={s.sheetHead}>
          <Text style={s.sheetTitle}>Фотокнига</Text>
          <Text style={s.sheetMeta}>{draft.pages} страницы · {draft.format}</Text>
        </View>

        <View style={s.tariffs} accessibilityRole="radiogroup">
          {tariffs.map((t) => {
            const on = t.id === tariff.id;
            return (
              <Tap
                key={t.id}
                style={[s.tariff, on && s.tariffOn]}
                onPress={() => setTariff(t)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.name}, ${rub(t.price)}, будет ${t.readyBy}`}>
                <View style={s.bk}>
                  <LinearGradient colors={t.cover} style={[s.bookIcon, t.tall && { width: 26, height: 38 }]} />
                </View>
                <Text style={s.tName}>{t.name}</Text>
                <Text style={s.tPrice}>{rub(t.price)}</Text>
                <Text style={s.tWhen}>будет {t.readyBy}</Text>
              </Tap>
            );
          })}
        </View>
        <Text style={s.about}>{tariff.about}</Text>

        <View style={s.seg} accessibilityRole="radiogroup">
          {(['Глянец', 'Зерно'] as const).map((f) => (
            <Tap key={f} style={[s.segItem, f === finish && s.segOn]} onPress={() => setFinish(f)} accessibilityRole="radio" accessibilityState={{ selected: f === finish }}>
              <Text style={[s.segText, f === finish && s.segTextOn]}>{f}</Text>
            </Tap>
          ))}
        </View>

        <Tap style={s.cta} onPress={onAdd} accessibilityRole="button">
          <Text style={s.ctaText}>В корзину · {rub(tariff.price)}</Text>
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.fg },
  edit: { width: 'auto', paddingHorizontal: 12 },
  editText: { fontSize: 15, fontWeight: '600', color: colors.coralLink },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  spread: {
    width: '100%', aspectRatio: 2 / 1.05, flexDirection: 'row', transform: [{ rotate: '-3deg' }],
    shadowColor: '#232B2A', shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 22 }, elevation: 8,
  },
  leaf: { flex: 1, padding: 8, gap: 6, backgroundColor: '#FFFDF9' },
  leafLeft: { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  leafRight: { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
  okPill: {
    position: 'absolute', bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, paddingVertical: 7, paddingLeft: 8, paddingRight: 12,
  },
  okDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  okText: { fontSize: 13, fontWeight: '600', color: colors.fg },

  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 8, gap: 14,
    shadowColor: '#232B2A', shadowOpacity: 0.1, shadowRadius: 30, shadowOffset: { width: 0, height: -10 }, elevation: 12,
  },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 18 },
  sheetTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.4, color: colors.fg },
  sheetMeta: { fontSize: 13, color: colors.mut },

  tariffs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  tariff: { flex: 1, borderRadius: 18, backgroundColor: colors.bg, padding: 10, paddingBottom: 12, gap: 2, borderWidth: 2, borderColor: 'transparent' },
  tariffOn: { backgroundColor: colors.coralTint, borderColor: colors.coralAction },
  bk: { height: 40, justifyContent: 'flex-end', marginBottom: 4 },
  bookIcon: { width: 34, height: 34, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  tName: { fontSize: 15, fontWeight: '700', color: colors.fg },
  tPrice: { fontSize: 15, fontWeight: '600', color: colors.fg, fontVariant: ['tabular-nums'] },
  tWhen: { fontSize: 13, color: colors.mut },
  about: { fontSize: 14, color: colors.mut, paddingHorizontal: 18, marginTop: -4 },

  seg: { flexDirection: 'row', backgroundColor: colors.card2, borderRadius: 12, padding: 3, marginHorizontal: 18 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  segOn: { backgroundColor: colors.card, shadowColor: '#232B2A', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '500', color: colors.mut },
  segTextOn: { color: colors.fg, fontWeight: '600' },

  cta: { height: 54, borderRadius: 16, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginHorizontal: 18 },
  ctaText: { fontSize: 17, fontWeight: '600', color: '#fff', letterSpacing: -0.15 },
});

