/**
 * «Скоро» на главной: ближайшие поводы для книги — общие праздники и личные даты из календаря.
 * У каждого — крайний день заказа («заказать до 25 дек — успеем»). Нажатие начинает книгу к этой дате.
 * Календарь подключается отдельной строкой, по желанию; без него видны только общие праздники.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarPlusIcon, CaretRightIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { SectionHeader, Tap } from '@/components/ui';
import { askCalendar, byDate, calendarGranted, calendarSupported, dayMonth, daysWord, holidays, monthShort, personalOccasions, presetFor, type Occasion } from '@/data/occasions';
import { colors, fonts } from '@/theme';

/** Сколько поводов показываем на главной. */
const MAX = 4;

type CalState = 'unknown' | 'off' | 'on' | 'denied';

export function SoonBlock() {
  const [base] = useState(() => holidays());
  const [personal, setPersonal] = useState<Occasion[]>([]);
  const [cal, setCal] = useState<CalState>('unknown');

  const load = () => personalOccasions().then(setPersonal).catch(() => setPersonal([]));

  // разрешение уже есть — читаем сразу; нет — ждём, пока человек сам подключит
  useEffect(() => {
    calendarGranted()
      .then((ok) => {
        setCal(ok ? 'on' : 'off');
        if (ok) load();
      })
      .catch(() => setCal('off'));
  }, []);

  const connect = async () => {
    Haptics.selectionAsync().catch(() => {});
    // после отказа система второй раз не спросит — ведём в настройки
    if (cal === 'denied') return Linking.openSettings().catch(() => {});
    const ok = await askCalendar().catch(() => false);
    setCal(ok ? 'on' : 'denied');
    if (ok) load();
  };

  const open = (o: Occasion) => {
    const p = presetFor(o);
    if ('book' in p) router.push({ pathname: '/book/[id]', params: { id: p.book } });
    else router.push({ pathname: '/story', params: { q: p.phrase } });
  };

  const list = [...personal, ...base].sort(byDate).slice(0, MAX);

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Скоро" />
      <View style={{ gap: 8 }}>
        {list.map((o, i) => (
          <Animated.View key={o.id} entering={FadeInDown.delay(i * 50).duration(320)}>
            <Tap style={s.card} onPress={() => open(o)} accessibilityRole="button" accessibilityLabel={`${o.title}, ${dayMonth(o.date)}. ${deadline(o)}. Собрать книгу`}>
              <View style={s.date}>
                <Text style={s.day}>{o.date.getDate()}</Text>
                <Text style={s.month}>{monthShort(o.date)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{o.title}</Text>
                <Text style={[s.sub, o.daysToOrder <= 7 && s.urgent]} numberOfLines={1}>{deadline(o)}</Text>
              </View>
              <CaretRightIcon size={16} color={colors.mut} weight="bold" />
            </Tap>
          </Animated.View>
        ))}

        {calendarSupported && (cal === 'off' || cal === 'denied') ? (
          <Tap style={[s.card, s.connect]} onPress={connect} accessibilityRole="button" accessibilityLabel="Добавить дни рождения и годовщины из календаря">
            <View style={[s.date, { backgroundColor: '#fff' }]}>
              <CalendarPlusIcon size={22} color={colors.peachInk} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>Дни рождения из календаря</Text>
              <Text style={s.sub} numberOfLines={2}>
                {cal === 'denied' ? 'Доступ выключен — включите в настройках телефона' : 'Подскажем книгу заранее. События не покидают телефон'}
              </Text>
            </View>
            <Text style={s.link}>{cal === 'denied' ? 'Настройки' : 'Добавить'}</Text>
          </Tap>
        ) : null}
        {cal === 'on' && personal.length === 0 ? <Text style={s.note}>В календаре на ближайшие месяцы нет дней рождения и годовщин.</Text> : null}
      </View>
    </View>
  );
}

function deadline(o: Occasion) {
  if (o.daysToOrder === 0) return 'Успеем, если заказать сегодня';
  if (o.daysToOrder <= 7) return `Осталось ${o.daysToOrder} ${daysWord(o.daysToOrder)}, чтобы успеть`;
  return `Заказать до ${dayMonth(o.orderBy)} — успеем`;
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 80, borderRadius: 26, backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 12 },
  connect: { backgroundColor: colors.peach },
  date: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 21, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg, fontVariant: ['tabular-nums'] },
  month: { fontSize: 12, lineHeight: 14, fontFamily: fonts.semibold, color: colors.coralLink },
  title: { fontSize: 17, lineHeight: 22, fontFamily: fonts.bold, color: colors.fg },
  sub: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  urgent: { color: colors.coralLink, fontFamily: fonts.semibold },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink },
  note: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, paddingHorizontal: 6 },
});
