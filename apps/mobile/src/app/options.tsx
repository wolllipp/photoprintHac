/**
 * Перед сборкой — четыре коротких вопроса на одном экране (как у Shutterfly, но проще: один экран, а не три):
 * какие фото взять, размер фото, фон страниц, украшения. Везде уже выбран вариант по умолчанию — можно сразу
 * «Собрать книгу» или «Пусть ИИ решит сам». Ответы уходят на сервер вместе с проектом (style).
 */
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { SparkleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setPendingBook, takePendingBook } from '@/api/book';
import { ChoiceTile } from '@/components/choice';
import { TitleBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { BGS, DECOS, DEFAULT_STYLE, PAGE_BG, PICKS, pagesFor, SIZES, type BookStyle } from '@/data/bookStyle';
import { fitPages, type Tariff } from '@/data/demo';
import { colors, fonts } from '@/theme';

export default function Options() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Record<string, string>>();
  const [style, setStyle] = useState<BookStyle>(DEFAULT_STYLE);
  const set = <K extends keyof BookStyle>(k: K, v: BookStyle[K]) => setStyle((x) => ({ ...x, [k]: v }));
  const pending = takePendingBook();
  const n = pending?.uris.length ?? Number(params.photos ?? 0);
  const tariff = (pending?.tariff ?? params.tariff ?? 'lite') as Tariff['id'];

  const go = (st: BookStyle) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // объём — по ответам: сколько фото останется и сколько их на странице (не меньше минимума тарифа)
    const pages = fitPages(tariff, pagesFor(n, st));
    if (pending) setPendingBook({ ...pending, pages, style: st });
    router.replace({ pathname: '/build', params: { ...params, pages: String(pages) } });
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <TitleBar title="Какой будет книга" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 150 }]} showsVerticalScrollIndicator={false}>
        <Text style={s.lead}>{n} фото · всё можно поменять потом в книге</Text>

        <Text style={s.q}>Какие фото взять</Text>
        <View style={s.list} accessibilityRole="radiogroup">
          {PICKS.map((p) => (
            <ChoiceTile key={p.id} title={p.name} sub={p.sub} on={style.pick === p.id} onPick={() => set('pick', p.id)} />
          ))}
        </View>

        <Text style={s.q}>Размер фото</Text>
        <View style={s.row} accessibilityRole="radiogroup">
          {SIZES.map((x) => {
            const on = style.size === x.id;
            return (
              <Tap key={x.id} style={[s.size, on && s.on]} onPress={() => set('size', x.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${x.name}: ${x.sub}`}>
                <SizeIcon size={x.id} on={on} />
                <Text style={[s.sizeName, on && { color: '#fff' }]}>{x.name}</Text>
                <Text style={[s.sizeSub, on && { color: 'rgba(255,255,255,0.8)' }]}>{x.sub}</Text>
              </Tap>
            );
          })}
        </View>

        <Text style={s.q}>Фон страниц</Text>
        <View style={s.row} accessibilityRole="radiogroup">
          {BGS.map((b) => {
            const on = style.bg === b.id;
            return (
              <Tap key={b.id} style={[s.bg, on && s.bgOn]} onPress={() => set('bg', b.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Фон: ${b.name}`}>
                <View style={[s.swatch, b.id === 'auto' ? s.swatchAuto : { backgroundColor: PAGE_BG[b.id] }]}>
                  {b.id === 'auto' ? <SparkleIcon size={18} color={colors.peachInk} weight="fill" /> : null}
                </View>
                <Text style={s.bgName} numberOfLines={2}>{b.name}</Text>
              </Tap>
            );
          })}
        </View>

        <Text style={s.q}>Украшения</Text>
        <View style={s.list} accessibilityRole="radiogroup">
          {DECOS.map((d) => (
            <ChoiceTile key={d.id} title={d.name} sub={d.sub} on={style.deco === d.id} onPick={() => set('deco', d.id)} />
          ))}
        </View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 10 }]}>
        <Tap style={s.cta} onPress={() => go(style)} accessibilityRole="button">
          <Text style={s.ctaText}>Собрать книгу</Text>
        </Tap>
        <Tap style={s.skip} onPress={() => go(DEFAULT_STYLE)} hitSlop={6} accessibilityRole="button">
          <Text style={s.skipText}>Пусть ИИ решит сам</Text>
        </Tap>
      </View>
    </View>
  );
}

/** Схема страницы: сколько фото на ней при этом размере. */
function SizeIcon({ size, on }: { size: BookStyle['size']; on: boolean }) {
  const c = on ? 'rgba(255,255,255,0.9)' : colors.mut2;
  const cells = size === 'large' ? [[0, 0, 1, 1]] : size === 'medium' ? [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
  const W = 34;
  return (
    <View style={{ width: W, height: W }}>
      {cells.map(([x, y, w, h], i) => (
        <View key={i} style={{ position: 'absolute', left: x * W + 1, top: y * W + 1, width: w * W - 2, height: h * W - 2, borderRadius: 2, backgroundColor: c }} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  lead: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut, marginBottom: 4 },
  q: { fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 12 },
  list: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  size: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 14, paddingHorizontal: 6 },
  on: { backgroundColor: colors.coralAction },
  sizeName: { fontSize: 14, fontFamily: fonts.bold, color: colors.fg },
  sizeSub: { fontSize: 11.5, fontFamily: fonts.regular, color: colors.mut, textAlign: 'center' },
  bg: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, borderWidth: 2, borderColor: 'transparent' },
  bgOn: { borderColor: colors.coralAction },
  swatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' },
  swatchAuto: { backgroundColor: '#fff' },
  bgName: { fontSize: 12, lineHeight: 15, fontFamily: fonts.semibold, color: colors.fg, textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 4, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  skip: { height: 40, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink },
});
