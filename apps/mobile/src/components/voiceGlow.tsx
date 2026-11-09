/**
 * Свечение голоса (по мотивам libraries.dev/voice, вариант «mobile»): от нижнего края экрана
 * поднимается мягкий разноцветный свет, растёт и «дышит» с голосом. Пока ИИ думает — свет
 * собирается в луч, который ходит из стороны в сторону.
 * Пятна — радиальные градиенты SVG (без размытия, поэтому дёшево), движение — на UI-потоке (Reanimated).
 * level — громкость 0…1 (в демо имитируется по ходу расшифровки; в продукте — уровень с микрофона).
 */
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/** Пятна света: цвет, центр по ширине (0…1), ширина, насколько откликается на голос. */
const LOBES = [
  { color: '#34D399', x: 0.12, w: 0.55, weight: 0.7 },
  { color: '#60A5FA', x: 0.32, w: 0.6, weight: 1 },
  { color: '#A78BFA', x: 0.5, w: 0.7, weight: 1.15 },
  { color: '#F472B6', x: 0.68, w: 0.6, weight: 1 },
  { color: '#FB923C', x: 0.88, w: 0.55, weight: 0.75 },
];
const H = 300;

export function VoiceGlow({ active, processing, level }: { active: boolean; processing: boolean; level: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  const shown = useSharedValue(0);
  const beam = useSharedValue(0); // 0 — свет по всей ширине, 1 — собран в луч
  const sweep = useSharedValue(0);

  useEffect(() => {
    shown.value = withTiming(active || processing ? 1 : 0, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [active, processing, shown]);
  useEffect(() => {
    beam.value = withTiming(processing ? 1 : 0, { duration: 500, easing: Easing.inOut(Easing.cubic) });
    if (processing) {
      sweep.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.System }), -1, true);
    } else {
      sweep.value = withTiming(0.5, { duration: 400 });
    }
  }, [processing, beam, sweep]);

  const wrap = useAnimatedStyle(() => ({ opacity: shown.value }));
  return (
    <Animated.View pointerEvents="none" style={[s.wrap, { height: H }, wrap]}>
      {LOBES.map((l, i) => (
        <Lobe key={l.color} i={i} lobe={l} width={width} level={level} beam={beam} sweep={sweep} />
      ))}
    </Animated.View>
  );
}

function Lobe({
  i,
  lobe,
  width,
  level,
  beam,
  sweep,
}: {
  i: number;
  lobe: (typeof LOBES)[number];
  width: number;
  level: SharedValue<number>;
  beam: SharedValue<number>;
  sweep: SharedValue<number>;
}) {
  const w = width * lobe.w;
  const breath = useSharedValue(0);
  useEffect(() => {
    // у каждого пятна своё медленное «дыхание» — свет живой даже в тишине
    breath.value = withRepeat(
      withSequence(withTiming(1, { duration: 1400 + i * 230, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1400 + i * 230, easing: Easing.inOut(Easing.sin) })),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [breath, i]);

  const a = useAnimatedStyle(() => {
    // по ширине: в луче все пятна стягиваются к одной точке, которая ходит из стороны в сторону
    const spreadX = lobe.x * width;
    const beamX = (0.15 + 0.7 * sweep.value) * width + (i - 2) * 14;
    const cx = spreadX + (beamX - spreadX) * beam.value;
    // высота: тишина — низкая полоска, голос — свет поднимается; в луче — ровный средний
    const voice = 0.22 + level.value * lobe.weight * 0.85 + breath.value * 0.08;
    const sy = voice + (0.55 - voice) * beam.value;
    const sx = 1 - 0.55 * beam.value;
    return {
      transform: [{ translateX: cx - w / 2 }, { translateY: (H * (1 - sy)) / 2 }, { scaleX: sx }, { scaleY: sy }],
      opacity: 0.75 + 0.25 * level.value,
    };
  });

  const id = `g${i}`;
  return (
    <Animated.View style={[s.lobe, { width: w, height: H }, a]}>
      <Svg width={w} height={H}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="100%" r="100%">
            <Stop offset="0" stopColor={lobe.color} stopOpacity={0.85} />
            <Stop offset="0.35" stopColor={lobe.color} stopOpacity={0.4} />
            <Stop offset="0.75" stopColor={lobe.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={H} rx={w / 2} ry={H} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  lobe: { position: 'absolute', left: 0, bottom: 0 },
});
