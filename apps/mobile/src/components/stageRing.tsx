/**
 * Этап заказа кольцом: заполнено на столько этапов, сколько пройдено, внутри — «3/5».
 * Готов — бирюзовое кольцо с галочкой. Одно и то же на главной и во вкладке «Заказы».
 */
import { CheckIcon } from 'phosphor-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts } from '@/theme';

export function StageRing({ stage, size = 50 }: { stage: number; size?: number }) {
  const ready = stage >= 4;
  const w = size / 10;
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const part = ready ? 1 : (stage + 1) / 5;
  const tint = ready ? colors.tealInk : colors.coralAction;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={ready ? 'Готов' : `Этап ${stage + 1} из 5`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.card2} strokeWidth={w} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={tint} strokeWidth={w} fill="none" strokeLinecap="round" strokeDasharray={`${c * part} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      {ready ? (
        <CheckIcon size={size * 0.4} color={tint} weight="bold" />
      ) : (
        <Text style={[s.n, { fontSize: size * 0.34 }]}>
          {stage + 1}
          <Text style={[s.of, { fontSize: size * 0.22 }]}>/5</Text>
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  n: { fontFamily: fonts.display, color: colors.fg, fontVariant: ['tabular-nums'] },
  of: { fontFamily: fonts.semibold, color: colors.mut },
});
