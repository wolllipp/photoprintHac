/**
 * Обработать фото: что сделает обработка — видно сразу, шторкой «до / после» поверх снимка.
 * Обработка идёт в локальном контуре (как и весь ИИ picPac); здесь «до» — пример недоэкспонированного кадра.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CaretLeftIcon, CaretRightIcon, CheckIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const OPTIONS = [
  { id: 'light', title: 'Свет и цвет', sub: 'вытянуть тени, тёплый баланс' },
  { id: 'sharp', title: 'Резкость', sub: 'без ореолов по краям' },
  { id: 'noise', title: 'Убрать шум', sub: 'для ночных и тёмных кадров' },
  { id: 'horizon', title: 'Выровнять горизонт', sub: 'и обрезать по краям' },
  { id: 'skin', title: 'Мягкая ретушь лиц', sub: 'без «пластика»' },
];

export default function Retouch() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const W = width - 32;
  const H = Math.round(W * 1.15);
  const [on, setOn] = useState<Record<string, boolean>>({ light: true, sharp: true, noise: true, horizon: false, skin: false });
  const count = Object.values(on).filter(Boolean).length;

  // шторка «до / после»: тянется за пальцем 1:1
  const x = useSharedValue(W / 2);
  const start = useSharedValue(W / 2);
  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      start.value = x.value;
    },
    onUpdate: (e) => {
      'worklet';
      x.value = Math.min(W - 2, Math.max(2, start.value + e.translationX));
    },
  });
  const before = useAnimatedStyle(() => ({ width: x.value }));
  const handle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value - 22 }] }));

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="Обработать фото" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}>
        <GestureDetector gesture={pan}>
          <View style={[s.frame, { width: W, height: H }]} accessible accessibilityLabel="Сравнение до и после обработки, потяните шторку">
            <Image source={pic('night-window')} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Animated.View style={[s.before, before]}>
              <View style={{ width: W, height: H }}>
                <Image source={pic('night-window')} style={StyleSheet.absoluteFill} contentFit="cover" />
                {/* «до»: кадр тёмный и холодный */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14,20,34,0.5)' }]} />
              </View>
            </Animated.View>
            <View style={[s.tag, { left: 12 }]}><Text style={s.tagText}>до</Text></View>
            <View style={[s.tag, { right: 12 }]}><Text style={s.tagText}>после</Text></View>
            <Animated.View style={[s.handleWrap, { height: H }, handle]} pointerEvents="none">
              <View style={s.line} />
              <View style={s.knob}>
                <CaretLeftIcon size={12} color={colors.fg} weight="bold" />
                <CaretRightIcon size={12} color={colors.fg} weight="bold" />
              </View>
            </Animated.View>
          </View>
        </GestureDetector>

        <Animated.View entering={enterItem(1)} style={s.group}>
          {OPTIONS.map((o) => {
            const v = on[o.id];
            return (
              <Tap
                key={o.id}
                style={s.row}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setOn((m) => ({ ...m, [o.id]: !m[o.id] }));
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: v }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{o.title}</Text>
                  <Text style={s.rowSub}>{o.sub}</Text>
                </View>
                <View style={[s.box, v && s.boxOn]}>{v ? <CheckIcon size={13} color="#fff" weight="bold" /> : null}</View>
              </Tap>
            );
          })}
        </Animated.View>
        <Text style={s.note}>Оригиналы не меняются: обработанные копии идут только в печать.</Text>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={[s.cta, count === 0 && { backgroundColor: colors.card2 }]} disabled={count === 0} onPress={() => router.push('/select')} accessibilityRole="button">
          <Text style={[s.ctaText, count === 0 && { color: colors.mut }]}>{count === 0 ? 'Выберите, что улучшить' : 'Выбрать фото для обработки'}</Text>
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  frame: { borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card2 },
  before: { position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden' },
  tag: { position: 'absolute', top: 12, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  tagText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },
  handleWrap: { position: 'absolute', top: 0, left: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  knob: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.25)' },
  group: { backgroundColor: colors.card, borderRadius: 26, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowTitle: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  box: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.mut2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.coralAction, borderColor: colors.coralAction },
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, paddingHorizontal: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
