/**
 * Стекло picPac — только поверх фото (на однотонном фоне стекло читается как серая плашка).
 *
 * iOS 26+: настоящее системное «жидкое стекло» (expo-glass-effect).
 * Остальные платформы: размытие + полупрозрачная заливка + светлая кромка + блик сверху —
 * всё, без чего стекло не читается как материал (app-store-screenshots / liquid-glass-aurora, apple-design §12).
 */
import MaskedViewBase from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useEffect, useState } from 'react';

const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Типы библиотеки отстают от React Native 0.88 — сама библиотека рабочая, уточняем тип здесь один раз. */
export const MaskedView = MaskedViewBase as unknown as ComponentType<ViewProps & { maskElement: ReactElement; children?: ReactNode }>;

/** Если пользователь включил «Понижение прозрачности» — стекло становится плотным (apple-design §14). */
function useReduceTransparency() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => sub?.remove();
  }, []);
  return reduce;
}

type GlassProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** light — светлое стекло с тёмным текстом; dark — дымчатое с белым текстом */
  tone?: 'light' | 'dark';
  interactive?: boolean;
};

export function Glass({ children, style, tone = 'light', interactive }: GlassProps) {
  const reduce = useReduceTransparency();
  const flat = StyleSheet.flatten(style) ?? {};
  const radius = typeof flat.borderRadius === 'number' ? flat.borderRadius : 0;

  if (reduce) {
    return <View style={[style, { backgroundColor: tone === 'light' ? 'rgba(255,255,255,0.94)' : 'rgba(28,28,30,0.9)' }]}>{children}</View>;
  }

  if (NATIVE_GLASS) {
    return (
      <GlassView
        style={style}
        glassEffectStyle="regular"
        colorScheme={tone === 'light' ? 'light' : 'dark'}
        isInteractive={interactive}>
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[style, s.shadow, tone === 'dark' && s.shadowDark]}>
      <BlurView
        intensity={tone === 'light' ? 50 : 35}
        tint={tone === 'light' ? 'light' : 'dark'}
        style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
      />
      {/* заливка */}
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: tone === 'light' ? 'rgba(255,255,255,0.42)' : 'rgba(18,18,20,0.22)' }]} />
      {/* блик сверху — свет падает на материал */}
      <LinearGradient
        colors={[tone === 'light' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      {/* кромка */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: tone === 'light' ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.28)' }]}
      />
      {/* содержимое — над слоями стекла (в вебе размытие создаёт свой слой и иначе перекрывает иконки) */}
      <View style={[s.content, contentLayout(flat)]} pointerEvents="box-none">{children}</View>
    </View>
  );
}

/**
 * Плавное размытие: снимок к низу постепенно размывается (маска-градиент поверх размытия),
 * как в профиле Olivia. `from` — с какой доли высоты начинается размытие.
 */
export function ProgressiveBlur({ from = 0.5, intensity = 45, tint = 'dark' }: { from?: number; intensity?: number; tint?: 'light' | 'dark' }) {
  // в браузере маска не поддерживается — даём мягкое затемнение вместо размытия (веб — только предпросмотр)
  if (Platform.OS === 'web') {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', tint === 'dark' ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.5)']}
        locations={[from, Math.min(1, from + 0.3)]}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return (
    <MaskedView
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      maskElement={<LinearGradient colors={['transparent', 'black']} locations={[from, Math.min(1, from + 0.28)]} style={StyleSheet.absoluteFill} />}>
      <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}

/** Раскладку содержимого (ряд, выравнивание, отступы) переносим с внешнего контейнера на слой содержимого. */
function contentLayout(f: ViewStyle): ViewStyle {
  const keys = ['flexDirection', 'alignItems', 'justifyContent', 'gap', 'padding', 'paddingHorizontal', 'paddingVertical', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (f[k] !== undefined) out[k] = f[k];
  return out as ViewStyle;
}

const s = StyleSheet.create({
  content: { flex: 1, alignSelf: 'stretch' },
  shadow: { shadowColor: '#1A1410', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  shadowDark: { shadowOpacity: 0.22 },
});
