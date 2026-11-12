/**
 * Проверка книги перед заказом (ТЗ, путь клиента п. 5): пустые рамки, мало пикселей для размера рамки,
 * смазанные фото и скриншоты. Каждое замечание объясняет, что будет на печати и что сделать; «Показать» ведёт к странице.
 * Разрешение считаем на телефоне по размеру снимка и рамки; для фото, которых нет на телефоне, — оценка сервера.
 * Пороги — как на сервере (quality.py): меньше 150 точек на дюйм заметно мягко, меньше 100 — размыто.
 */
import { Image } from 'expo-image';
import { WarningCircleIcon } from 'phosphor-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoWarning } from '@/api/book';
import { Tap } from '@/components/ui';
import { isSpread, layoutOf } from '@/data/layouts';
import { pic, type Pic } from '@/data/photos';
import { photoSize } from '@/data/picked';
import { SHEET_TAIL, sheetIn, sheetOut } from '@/motion';
import { colors, fonts } from '@/theme';

type Page = { layout: string; photos: (Pic | undefined | null)[] };
export type Issue = { page: number; photo?: Pic; title: string; text: string; hard: boolean };

/** Сантиметры страницы по формату «20×20» (ширина × высота). */
const pageCm = (format: string) => {
  const [w, h] = format.split('×').map(Number);
  return { w: w || 20, h: h || 20 };
};

/** Точек на дюйм у фото в рамке (фото заполняет рамку целиком). */
function dpiIn(px: { w: number; h: number }, slot: { w: number; h: number }, page: { w: number; h: number }, spread: boolean) {
  const inW = (slot.w * page.w * (spread ? 2 : 1)) / 2.54;
  const inH = (slot.h * page.h) / 2.54;
  return Math.min(px.w / inW, px.h / inH);
}

export function findIssues(pages: Page[], format: string, server: Record<string, PhotoWarning[]> = {}): Issue[] {
  const cm = pageCm(format);
  const out: Issue[] = [];
  pages.forEach((p, k) => {
    if (k > 0 && isSpread(pages[k - 1].layout)) return; // вторая половина сквозного фото
    const def = layoutOf(p.layout);
    const spread = isSpread(p.layout);
    const empty = def.slots.filter((_, i) => !p.photos[i]).length;
    if (empty)
      out.push({
        page: k,
        title: empty === 1 ? 'Пустая рамка' : `Пустых рамок: ${empty}`,
        text: 'На печати здесь будет белое место. Добавьте фото или выберите макет с меньшим числом фото.',
        hard: true,
      });
    def.slots.forEach((slot, i) => {
      const photo = p.photos[i];
      if (!photo) return;
      const size = typeof photo === 'string' ? photoSize(photo) : undefined;
      const fromServer = typeof photo === 'string' ? (server[photo] ?? []) : [];
      if (size) {
        const dpi = Math.round(dpiIn(size, slot, cm, spread));
        if (dpi < 150)
          out.push({
            page: k,
            photo,
            title: dpi < 100 ? 'Фото будет размытым' : 'Фото будет мягче остальных',
            text: `${size.w}×${size.h} пикс. — это ${dpi} точек на дюйм для рамки ${Math.round(slot.w * cm.w * (spread ? 2 : 1))}×${Math.round(slot.h * cm.h)} см, для чёткой печати нужно от 150. Поставьте фото в рамку поменьше или замените.`,
            hard: dpi < 100,
          });
      } else {
        const low = fromServer.find((w) => w.code === 'low_res' && (w.level === 'poor' || w.level === 'very_poor'));
        if (low) out.push({ page: k, photo, title: low.level === 'very_poor' ? 'Фото будет размытым' : 'Фото будет мягче остальных', text: low.text, hard: low.level === 'very_poor' });
      }
      const blur = fromServer.find((w) => w.code === 'blur');
      if (blur) out.push({ page: k, photo, title: 'Смазанное фото', text: 'Снимок нерезкий — на бумаге это видно сильнее, чем на экране. Можно заменить похожим кадром.', hard: false });
      const shot = fromServer.find((w) => w.code === 'screenshot');
      if (shot) out.push({ page: k, photo, title: 'Похоже на скриншот', text: 'Снимок экрана печатается с мелким текстом и рамками телефона. Оставить его в книге?', hard: false });
    });
  });
  return out;
}

export function PreflightSheet({ issues, onShow, onOrder, onClose }: { issues: Issue[]; onShow: (page: number) => void; onOrder: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const hard = issues.filter((x) => x.hard).length;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(240)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
        <View style={s.grab} />
        <View style={{ gap: 4, paddingHorizontal: 4 }}>
          <Text style={s.title}>Проверьте перед заказом</Text>
          <Text style={s.sub}>{hard ? 'Есть места, которые на печати будут заметны' : 'Мелочи — можно заказать и так'}</Text>
        </View>
        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
          {issues.map((x, i) => (
            <View key={i} style={s.row}>
              {x.photo ? (
                <Image source={pic(x.photo)} style={s.thumb} contentFit="cover" />
              ) : (
                <View style={[s.thumb, s.empty]} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={s.rowHead}>
                  <WarningCircleIcon size={15} color={x.hard ? colors.coralAction : colors.mut} weight="fill" />
                  <Text style={s.rowTitle}>
                    стр. {x.page + 1} · {x.title}
                  </Text>
                </View>
                <Text style={s.rowText}>{x.text}</Text>
                <Tap onPress={() => onShow(x.page)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Показать страницу ${x.page + 1}`}>
                  <Text style={s.link}>Показать</Text>
                </Tap>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={s.btns}>
          <Tap style={[s.btn, s.btnGhost]} onPress={onOrder} accessibilityRole="button">
            <Text style={s.btnGhostText}>Заказать как есть</Text>
          </Tap>
          <Tap style={[s.btn, s.btnMain]} onPress={() => onShow(issues[0].page)} accessibilityRole="button">
            <Text style={s.btnMainText}>Исправить</Text>
          </Tap>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  sub: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  row: { flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: 20, padding: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.card2 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.mut, backgroundColor: 'transparent' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, flexShrink: 1 },
  rowText: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.regular, color: colors.mut },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.coralLink, paddingTop: 2 },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.card },
  btnGhostText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  btnMain: { backgroundColor: colors.coralAction },
  btnMainText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
});
