/**
 * Базовые компоненты picPac: нажимаемая область с откликом, заглушка фото, монетка пиков,
 * заголовок секции, полоса этапов.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, photoGradients, type PhotoKey } from '@/theme';

const APressable = Animated.createAnimatedComponent(Pressable);

/**
 * Отклик на нажатие: сжатие начинается сразу на касании (90 мс), отпускание — мягкой пружиной
 * с едва заметным отскоком назад (apple-design: отклик на касание, а не на отпускание).
 */
export function Tap({ style, children, onPressIn, onPressOut, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const p = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.035 * p.value }], opacity: 1 - 0.1 * p.value }));
  return (
    <APressable
      {...rest}
      onPressIn={(e) => {
        p.set(withTiming(1, { duration: 90 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.set(withSpring(0, { damping: 15, stiffness: 320, mass: 0.6 }));
        onPressOut?.(e);
      }}
      style={[style, a]}>
      {children}
    </APressable>
  );
}

export function Photo({ k, style }: { k: PhotoKey; style?: StyleProp<ViewStyle> }) {
  const g = photoGradients[k];
  return (
    <LinearGradient
      colors={g as unknown as [string, string, ...string[]]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[{ overflow: 'hidden' }, style]}>
      <View style={styles.hill} />
    </LinearGradient>
  );
}

/** Пик — монетка с фирменной курсивной P, лёгкий объём. */
export function Pik({ size = 20 }: { size?: number }) {
  const r = size / 2;
  const fs = size * 0.5;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="pik" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor="#E0837C" />
          <Stop offset="1" stopColor={colors.coralAction} />
        </SvgGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill="url(#pik)" />
      <Circle cx={r} cy={r} r={r * 0.76} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={Math.max(1, size * 0.05)} />
      {/* у Unbounded высота заглавной ≈0.7 кегля — опускаем базовую линию на половину */}
      <SvgText x={r} y={r + fs * 0.35} fontSize={fs} fontFamily={fonts.display} fill="#fff" textAnchor="middle">P</SvgText>
    </Svg>
  );
}

export function SectionHeader({ title, action, accessory }: { title: string; action?: string; accessory?: ReactNode }) {
  return (
    <View style={styles.sec}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.secTitle}>{title}</Text>
        {accessory}
      </View>
      {action ? (
        <Tap hitSlop={10} accessibilityRole="button">
          <Text style={styles.secAction}>{action}</Text>
        </Tap>
      ) : null}
    </View>
  );
}

/** Полоса этапов заказа: готово — бирюзовый, текущий — коралловый наполовину. */
export function SegmentBar({ total, done, height = 5 }: { total: number; done: number; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.seg, { height, borderRadius: height }, i < done && { backgroundColor: colors.tealInk }]}>
          {i === done ? <View style={[styles.segNow, { borderRadius: height }]} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hill: {
    position: 'absolute',
    left: '-15%',
    right: '-15%',
    bottom: '-35%',
    height: '65%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  pik: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  pikP: { fontFamily: fonts.logo, color: '#fff', textAlign: 'center' },
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  secTitle: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  secAction: { fontSize: 16, fontFamily: fonts.medium, color: colors.coralLink },
  seg: { flex: 1, backgroundColor: colors.card2, overflow: 'hidden' },
  segNow: { width: '55%', height: '100%', backgroundColor: colors.coralAction },
});
