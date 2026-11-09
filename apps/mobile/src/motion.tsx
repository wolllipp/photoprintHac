/**
 * Движение picPac. Токены — из transitions.dev (_root.css), переведены на Reanimated.
 * Пружины — по apple-design: по умолчанию без перелёта (damping 1), отскок только после жеста.
 * Все анимации учитывают системную настройку «Уменьшить движение» (ReduceMotion.System).
 */
import { CheckIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

export const duration = { stagger: 40, micro: 80, quick: 150, fast: 250, medium: 350, slow: 400, verySlow: 500 } as const;
export const ease = {
  smoothOut: Easing.bezier(0.22, 1, 0.36, 1),
  inOut: Easing.inOut(Easing.ease),
  bounce: Easing.bezier(0.34, 1.36, 0.64, 1),
} as const;
/** Пружина для шторки: критическое демпфирование, response ≈ 0.35 с (apple-design). */
export const sheetSpring = { damping: 26, stiffness: 260, mass: 1, reduceMotion: ReduceMotion.System } as const;
/** После броска пальцем — лёгкий отскок. */
export const flickSpring = { damping: 20, stiffness: 240, mass: 1, reduceMotion: ReduceMotion.System } as const;

/** Появление элемента списка: подъём на 12 px с затуханием, шаг 40 мс. */
export const enterItem = (index = 0) =>
  FadeInDown.duration(duration.slow).easing(ease.smoothOut).delay(index * duration.stagger * 2).reduceMotion(ReduceMotion.System);

/**
 * Пересчёт числа: значение «докручивается» от старого к новому за 450 мс с замедлением в конце —
 * видно, что сумма именно пересчиталась. Целые остаются целыми, деньги считаются до копейки.
 * При «Уменьшить движение» число меняется сразу.
 */
export function AnimatedNumber({ value, format, style }: { value: number; format: (n: number) => string; style?: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const a = from.current;
    const b = value;
    if (a === b) return;
    const dur = reduce ? 1 : 450;
    const whole = Number.isInteger(a) && Number.isInteger(b);
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = a + (b - a) * e;
      const next = k === 1 ? b : whole ? Math.round(v) : Math.round(v * 100) / 100;
      from.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style]} accessibilityLabel={format(value)}>
      {format(shown)}
    </Text>
  );
}

/** Галочка успеха (transitions.dev «success check»): поворот + подъём + масштаб, 500 мс. */
const checkIn = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }, { rotate: '-25deg' }, { translateY: 6 }] },
  60: { opacity: 1, transform: [{ scale: 1.08 }, { rotate: '4deg' }, { translateY: -2 }], easing: ease.smoothOut },
  100: { opacity: 1, transform: [{ scale: 1 }, { rotate: '0deg' }, { translateY: 0 }], easing: ease.inOut },
})
  .duration(duration.verySlow)
  .reduceMotion(ReduceMotion.System);

export function SuccessCheck({ size = 56 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View entering={checkIn} style={[s.check, { width: size, height: size, borderRadius: size / 2 }]}>
        <CheckIcon size={size * 0.48} color="#fff" weight="bold" />
      </Animated.View>
    </View>
  );
}

/** Строка «думаю» (transitions.dev «thinking states»): мягкая пульсация, пока ИИ работает. */
export function ThinkingLine({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withSequence(withTiming(0.4, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false, undefined, ReduceMotion.System);
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View style={a}>
      <Text style={[s.thinking, style]} accessibilityLiveRegion="polite">{text}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  check: { backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  thinking: { fontSize: 14, color: colors.mut },
});
