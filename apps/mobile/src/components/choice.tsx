/**
 * Строка выбора (доставка, оплата): слева название и пояснение, справа цена или пометка.
 * Выбранная — коралловая рамка плавно проявляется, на миг вспыхивает свечение (как допуслуги в корзине).
 */
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ease } from '@/motion';
import { colors, fonts } from '@/theme';

export function ChoiceTile({ title, sub, right, on, onPick }: { title: string; sub: string; right?: string; on: boolean; onPick: () => void }) {
  const v = useSharedValue(on ? 1 : 0);
  const glow = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(on ? 1 : 0, { duration: 260, easing: ease.smoothOut });
  }, [on, v]);
  const frame = useAnimatedStyle(() => ({
    borderColor: interpolateColor(v.value, [0, 1], ['rgba(184,79,75,0)', colors.coralAction]),
    shadowColor: colors.coralAction,
    shadowOpacity: 0.32 * glow.value,
    shadowRadius: 12 * glow.value,
    shadowOffset: { width: 0, height: 0 },
  }));
  const price = useAnimatedStyle(() => ({ color: interpolateColor(v.value, [0, 1], [colors.fg, colors.coralAction]) }));
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        if (!on) glow.set(withSequence(withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })));
        onPick();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={[title, sub, right].filter(Boolean).join(', ')}>
      <Animated.View style={[s.tile, frame]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.sub} numberOfLines={1}>{sub}</Text>
        </View>
        {right ? <Animated.Text style={[s.right, price]}>{right}</Animated.Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 2, borderColor: 'transparent' },
  title: { fontSize: 16, lineHeight: 20, fontFamily: fonts.bold, color: colors.fg },
  sub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut },
  right: { fontSize: 16, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
});
