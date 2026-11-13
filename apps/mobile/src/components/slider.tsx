/**
 * Ползунок: тащить кружок или нажать на дорожку. Значение от min до max; onChange — пока тянут,
 * onDone — когда отпустили (один шаг истории правок, а не сотня). Без сторонних библиотек — жесты и анимация уже есть.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { colors } from '@/theme';

const KNOB = 26;

export function Slider({ value, min, max, onChange, onDone, label }: { value: number; min: number; max: number; onChange: (v: number) => void; onDone?: (v: number) => void; label: string }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const toX = (v: number, ww: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * Math.max(0, ww - KNOB);

  useEffect(() => {
    x.set(toX(value, w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, w]);

  const emit = (px: number, done: boolean) => {
    const v = min + (px / Math.max(1, w - KNOB)) * (max - min);
    const r = Math.round(v * 20) / 20; // шаг 0,05
    onChange(r);
    if (done) onDone?.(r);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      const nx = Math.min(width.get() - KNOB, Math.max(0, e.x - KNOB / 2));
      x.set(nx);
      runOnJS(emit)(nx, false);
    })
    .onUpdate((e) => {
      const nx = Math.min(width.get() - KNOB, Math.max(0, e.x - KNOB / 2));
      x.set(nx);
      runOnJS(emit)(nx, false);
    })
    .onFinalize(() => {
      runOnJS(emit)(x.get(), true);
      runOnJS(Haptics.selectionAsync)();
    });

  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  // закрашено от начала дорожки до центра кружка
  const fill = useAnimatedStyle(() => ({ width: x.get() }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={s.wrap}
        onLayout={(e: LayoutChangeEvent) => {
          setW(e.nativeEvent.layout.width);
          width.set(e.nativeEvent.layout.width);
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: Math.round(min * 100), max: Math.round(max * 100), now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const step = (max - min) / 10;
          const v = Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step)));
          onChange(v);
          onDone?.(v);
        }}>
        <View style={s.track} />
        <Animated.View style={[s.fill, fill]} />
        <Animated.View style={[s.knob, knob]} />
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  wrap: { height: 36, justifyContent: 'center' },
  track: { position: 'absolute', left: KNOB / 2, right: KNOB / 2, height: 4, borderRadius: 2, backgroundColor: colors.card2 },
  fill: { position: 'absolute', left: KNOB / 2, height: 4, borderRadius: 2, backgroundColor: colors.coralAction },
  knob: { position: 'absolute', left: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' },
});
