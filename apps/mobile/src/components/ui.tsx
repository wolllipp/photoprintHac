/**
 * Базовые компоненты picPac: нажимаемая область с откликом, заглушка фото, монетка пиков,
 * заголовок секции, полоса этапов.
 */
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, photoGradients, type PhotoKey } from '@/theme';

/** Отклик на нажатие сразу: лёгкое сжатие (apple-design, emil-design-eng). */
export function Tap({ style, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 }]}>
      {children}
    </Pressable>
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
  return (
    <LinearGradient
      colors={['#D46F69', colors.coralAction]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[
        styles.pik,
        { width: size, height: size, borderRadius: size / 2, transform: [{ rotate: '-8deg' }] },
      ]}>
      <Text style={[styles.pikP, { fontSize: size * 0.6, lineHeight: size * 1.05 }]}>P</Text>
    </LinearGradient>
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
  secTitle: { fontSize: 19, fontFamily: fonts.displayMedium, letterSpacing: -0.3, color: colors.fg },
  secAction: { fontSize: 16, fontWeight: '500', color: colors.coralLink },
  seg: { flex: 1, backgroundColor: colors.card2, overflow: 'hidden' },
  segNow: { width: '55%', height: '100%', backgroundColor: colors.coralAction },
});
