/**
 * Проверка качества (A8): что ИИ нашёл в кадрах книги и что с этим сделал — до заказа, а не после печати.
 * «Мало пикселей» — решает человек: заменить похожим кадром или оставить. «Лицо у края» — уже исправлено,
 * «Показать» раскрывает было/стало с линией обреза.
 * В продукте — результаты модуля качества (разрешение против формата, лица и зона обреза 60/30 px).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import { pic, type Pic } from '@/data/photos';
import { ease } from '@/motion';
import { colors, fonts } from '@/theme';

type LowRes = 'ask' | 'replaced' | 'kept';

export function QualityCard({ checked, format }: { checked: number; format: string }) {
  const [low, setLow] = useState<LowRes>('ask');
  const [open, setOpen] = useState(false);
  const left = low === 'ask' ? 1 : 0;
  const cover: Pic = low === 'replaced' ? 'night-window' : 'concert';

  return (
    <Animated.View layout={LinearTransition.duration(260).easing(ease.smoothOut)} style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Проверили {checked} кадров</Text>
        <Text style={[s.badge, left ? s.badgeWarn : s.badgeOk]}>{left ? '1 нужно решить' : 'всё в порядке'}</Text>
      </View>

      {/* мало пикселей — решает человек */}
      <View style={s.row}>
        <Image source={pic(cover)} style={s.thumb} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.rowTitle}>{low === 'replaced' ? 'Заменили на похожий кадр' : low === 'kept' ? 'Оставили как есть' : `Мало пикселей для ${format}`}</Text>
          <Text style={s.rowSub}>
            {low === 'ask' ? 'Разворот 3, на весь лист — напечатается мягким' : low === 'replaced' ? 'Тот же вечер, резкость в норме' : 'Напечатаем мягче остальных'}
          </Text>
        </View>
      </View>
      {low === 'ask' ? (
        <View style={s.btns}>
          <Tap
            style={[s.btn, s.btnMain]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setLow('replaced');
            }}
            accessibilityRole="button">
            <Text style={[s.btnText, { color: '#fff' }]}>Заменить похожим</Text>
          </Tap>
          <Tap
            style={s.btn}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setLow('kept');
            }}
            accessibilityRole="button">
            <Text style={s.btnText}>Оставить</Text>
          </Tap>
        </View>
      ) : null}

      <View style={s.sep} />

      {/* лицо у края — уже исправлено */}
      <View style={s.row}>
        <Image source={pic('friends-selfie')} style={s.thumb} contentFit="cover" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.rowTitle}>Лицо было у края страницы</Text>
          <Text style={s.rowSub}>Сдвинули кадр — в обрез не попадёт</Text>
        </View>
        <Tap
          style={s.link}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen((o) => !o);
          }}
          accessibilityRole="button"
          hitSlop={8}>
          <Text style={s.linkText}>{open ? 'Скрыть' : 'Показать'}</Text>
        </Tap>
      </View>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} style={s.compare}>
          <Frame label="было" position="left" />
          <Frame label="стало" position="center" />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Кадр на странице с линией обреза: что за пунктиром — уйдёт под нож. */
function Frame({ label, position }: { label: string; position: 'left' | 'center' }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <View style={s.page}>
        {/* кадр шире страницы: «было» — сдвинут, лицо уходит за линию обреза; «стало» — по центру */}
        <Image source={pic('friends-selfie')} style={[s.wide, { left: position === 'left' ? '-50%' : '-25%' }]} contentFit="cover" />
        <View style={[s.cut, position === 'left' && s.cutBad]} pointerEvents="none" />
      </View>
      <Text style={[s.frameLabel, position === 'center' ? { color: colors.tealInk } : { color: colors.coralAction }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  badge: { fontSize: 12.5, fontFamily: fonts.bold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  badgeWarn: { color: colors.warn, backgroundColor: colors.warnTint },
  badgeOk: { color: colors.tealInk, backgroundColor: colors.tealTint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 12 },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut },
  btns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  btnMain: { backgroundColor: colors.coralAction },
  btnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  sep: { height: 1, backgroundColor: 'rgba(60,40,30,0.08)' },
  link: { paddingHorizontal: 4, paddingVertical: 6 },
  linkText: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.coralLink },
  compare: { flexDirection: 'row', gap: 10 },
  page: { aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card2 },
  cut: { position: 'absolute', left: '7%', right: '7%', top: '7%', bottom: '7%', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.9)' },
  wide: { position: 'absolute', top: 0, bottom: 0, width: '150%' },
  cutBad: { borderColor: colors.coralAction, borderWidth: 2 },
  frameLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut, textAlign: 'center' },
});
