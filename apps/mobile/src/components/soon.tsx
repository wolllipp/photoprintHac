/**
 * «Скоро» на главной: ближайшие поводы для книги — общие праздники и личные даты из календаря.
 * У каждого — крайний день заказа («заказать до 25 дек — успеем»). Нажатие начинает книгу к этой дате.
 * Календарь подключается отдельной строкой, по желанию; без него видны только общие праздники.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarPlusIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <View style={{ gap: 10 }}>
      <SectionHeader title="Скоро" />
      {/* в одну строку — листается вбок и не занимает пол-экрана */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.row}>
        {list.map((o, i) => (
          <Animated.View key={o.id} entering={FadeInDown.delay(i * 50).duration(320)}>
            <Tap style={s.card} onPress={() => open(o)} accessibilityRole="button" accessibilityLabel={`${o.title}, ${dayMonth(o.date)}. ${deadline(o)}. Собрать книгу`}>
              <View style={s.date}>
                <Text style={s.day}>{o.date.getDate()}</Text>
                <Text style={s.month}>{monthShort(o.date)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{o.title}</Text>
                <Text style={[s.sub, o.daysToOrder <= 7 && s.urgent]} numberOfLines={2}>{deadline(o)}</Text>
              </View>
            </Tap>
          </Animated.View>
        ))}

        {calendarSupported && (cal === 'off' || cal === 'denied') ? (
          <Tap style={[s.card, s.connect]} onPress={connect} accessibilityRole="button" accessibilityLabel={cal === 'denied' ? 'Доступ к календарю выключен, открыть настройки' : 'Добавить дни рождения из календаря. События не покидают телефон'}>
            <View style={s.date}>
              <CalendarPlusIcon size={22} color={colors.peachInk} weight="bold" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{cal === 'denied' ? 'Календарь выключен' : 'Дни рождения'}</Text>
              <Text style={s.sub} numberOfLines={2}>{cal === 'denied' ? 'Включить в настройках' : 'Добавить из календаря — не покидают телефон'}</Text>
            </View>
          </Tap>
        ) : null}
      </ScrollView>
    </View>
  );
}

function deadline(o: Occasion) {
  if (o.daysToOrder === 0) return 'Успеем, если заказать сегодня';
  if (o.daysToOrder <= 7) return `${o.daysToOrder} ${daysWord(o.daysToOrder)}, чтобы успеть`;
  return `Заказать до ${dayMonth(o.orderBy)}`;
}

const s = StyleSheet.create({
  bleed: { marginHorizontal: -16 },
  row: { paddingHorizontal: 16, gap: 8 },
  card: { width: 236, flexDirection: 'row', alignItems: 'center', gap: 12, height: 76, borderRadius: 22, backgroundColor: colors.card, paddingHorizontal: 12 },
  connect: { backgroundColor: colors.peach },
  date: { width: 50, height: 52, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 19, lineHeight: 22, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg, fontVariant: ['tabular-nums'] },
  month: { fontSize: 11.5, lineHeight: 13, fontFamily: fonts.semibold, color: colors.coralLink },
  title: { fontSize: 15, lineHeight: 19, fontFamily: fonts.bold, color: colors.fg },
  sub: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  urgent: { color: colors.coralLink, fontFamily: fonts.semibold },
});
