/**
 * Календарь в стиле приложения: месяц сеткой, листается стрелками; неделя с понедельника.
 * Дни раньше minDate — бледные и не выбираются. Выбранный — коралловый кружок, сегодня — обводка.
 */
import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function Calendar({ value, onChange, minDate }: { value: Date; onChange: (d: Date) => void; minDate: Date }) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = day0(new Date());
  const min = day0(minDate);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const shift = (first.getDay() + 6) % 7; // понедельник — первый
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array.from({ length: shift }, () => null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  while (cells.length % 7) cells.push(null);
  const canBack = new Date(month.getFullYear(), month.getMonth(), 0) >= min;
  const go = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + d, 1));
  };
  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Tap style={[s.arrow, !canBack && { opacity: 0.3 }]} disabled={!canBack} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Предыдущий месяц" hitSlop={8}>
          <CaretLeftIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
        <Animated.Text key={month.getTime()} entering={FadeIn.duration(160)} style={s.month}>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Animated.Text>
        <Tap style={s.arrow} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Следующий месяц" hitSlop={8}>
          <CaretRightIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>
      <View style={s.row}>
        {WEEK.map((w) => (
          <Text key={w} style={s.week}>{w}</Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, r) => (
        <View key={r} style={s.row}>
          {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
            if (!d) return <View key={i} style={s.cell} />;
            const off = d < min;
            const on = same(d, value);
            const isToday = same(d, today);
            return (
              <Tap
                key={i}
                style={s.cell}
                disabled={off}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onChange(d);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: off }}
                accessibilityLabel={`${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()}`}>
                <View style={[s.dot, isToday && s.today, on && s.on]}>
                  <Text style={[s.num, off && { color: colors.mut2 }, on && { color: '#fff', fontFamily: fonts.bold }]}>{d.getDate()}</Text>
                </View>
              </Tap>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, borderRadius: 18, padding: 10, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  row: { flexDirection: 'row' },
  week: { flex: 1, textAlign: 'center', fontSize: 12, fontFamily: fonts.semibold, color: colors.mut, paddingVertical: 4 },
  cell: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.card2 },
  on: { backgroundColor: colors.coralAction, borderWidth: 0 },
  num: { fontSize: 15, fontFamily: fonts.medium, color: colors.fg, fontVariant: ['tabular-nums'] },
});
