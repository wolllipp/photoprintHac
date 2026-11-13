/**
 * Выбор тарифа — листом снизу, там, где принимают решение (плашка цены в книге, строка книги в оформлении),
 * а не только в конце книги, до которого почти никто не долистает.
 * У каждого тарифа — чем отличается, сколько стоит именно эта книга (объём подгоняется под диапазон тарифа)
 * и, если в книге есть сквозные развороты, где они без шва.
 */
import * as Haptics from 'expo-haptics';
import { CheckIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { BOOK, bookPrice, fitFormat, fitPages, tariffs, type Tariff } from '@/data/demo';
import { rub } from '@/data/store';
import { SHEET_TAIL, sheetIn, sheetOut } from '@/motion';
import { colors, fonts } from '@/theme';

/** Чем тарифы отличаются — одной строкой, без маркетинга. */
const WHAT: Record<Tariff['id'], string> = {
  lite: 'Тонкие листы, как в журнале',
  classic: 'Плотные листы, раскрытие на 180°, без шва',
  premium: 'Фотобумага 1 мм, разворот без шва',
};

export function TariffSheet({
  value,
  format,
  pages,
  hasSpreads,
  onPick,
  onMore,
  onClose,
}: {
  value: Tariff['id'];
  /** формат книги сейчас — у тарифа без такого формата берём ближайший */
  format: string;
  /** сколько страниц хочет книга — у каждого тарифа свой диапазон */
  pages: number;
  /** в книге есть сквозные развороты — подсказываем, где они без шва */
  hasSpreads?: boolean;
  onPick: (t: Tariff['id']) => void;
  /** «Изменить формат и объём» — на экран книги */
  onMore?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(240)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
        <View style={s.grab} />
        <Text style={s.title}>Какая книга?</Text>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {tariffs.map((t) => {
            const on = t.id === value;
            const fmt = fitFormat(t.id, format);
            const p = fitPages(t.id, pages);
            const price = bookPrice(t.id, fmt, pages, 'Глянец');
            return (
              <Tap
                key={t.id}
                style={[s.row, on && s.rowOn]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onPick(t.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.name}: ${WHAT[t.id]}, ${p} страниц, ${rub(price)}`}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{t.name}</Text>
                    {on ? <CheckIcon size={16} color={colors.coralAction} weight="bold" /> : null}
                  </View>
                  <Text style={s.what}>{WHAT[t.id]}</Text>
                  <Text style={s.meta}>
                    {fmt} · {p} стр. · от {BOOK[t.id].min} до {BOOK[t.id].max}
                    {hasSpreads ? (t.id === 'lite' ? ' · шов по центру' : ' · разворот без шва') : ''}
                  </Text>
                </View>
                <Text style={[s.price, on && { color: colors.coralAction }]}>{rub(price)}</Text>
              </Tap>
            );
          })}
        </View>
        {onMore ? (
          <Tap onPress={onMore} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'center' }}>
            <Text style={s.link}>Изменить формат и объём</Text>
          </Tap>
        ) : null}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 20, padding: 14, borderWidth: 2, borderColor: 'transparent' },
  rowOn: { borderColor: colors.coralAction, backgroundColor: colors.bg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  what: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  meta: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut },
  price: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink, paddingVertical: 4 },
});
