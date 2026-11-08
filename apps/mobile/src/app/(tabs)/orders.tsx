/**
 * Заказы → отслеживание как у такси: этап крупно, полоса из 5 сегментов, живая строка с производства.
 * Этапы и прогресс позже приходят из GET /orders/{id} (таблицы order_stages, production_progress).
 */
import { router } from 'expo-router';
import { CheckIcon } from 'phosphor-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentBar, Tap } from '@/components/ui';
import { rub, useStore } from '@/data/store';
import { colors } from '@/theme';

const LABELS = ['Принят', 'Проверен', 'Печать', 'Доставка', 'Готов'];

export default function Orders() {
  const insets = useSafeAreaInsets();
  const { orders } = useStore();
  const order = orders[0];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }]}>
      <Text style={s.title}>Заказы</Text>

      {!order ? (
        <View style={{ gap: 14, paddingTop: 24 }}>
          <Text style={s.emptyText}>Заказов пока нет. Оформленные книги появятся здесь со статусом печати.</Text>
          <Tap style={s.btn} onPress={() => router.navigate('/')} accessibilityRole="button">
            <Text style={s.btnText}>На главную</Text>
          </Tap>
        </View>
      ) : (
        <>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={s.small}>Сейчас</Text>
                <Text style={s.stage}>Печатаем</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.small}>Будет у вас</Text>
                <Text style={s.when}>{order.readyBy}</Text>
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <SegmentBar total={5} done={2} height={7} />
              <View style={s.labels}>
                {LABELS.map((l, i) => (
                  <Text key={l} style={[s.label, i === 2 && s.labelOn]}>{l}</Text>
                ))}
              </View>
            </View>
            <View style={s.live}>
              <View style={s.liveDot} />
              <View style={{ flex: 1 }}>
                <Text style={s.liveTitle}>Готово 6 из 12 разворотов</Text>
                <Text style={s.small}>линия фотокниг · обновлено 2 мин назад</Text>
              </View>
            </View>
          </View>

          <View style={s.group}>
            <Step done title="Принят и оплачен" sub={`№${order.id} · ${rub(order.total)}`} />
            <Step done title="Макет проверен" sub="лица, резкость, обрез — всё в норме" />
            <Step now title="Печатаем" sub="затем переплёт и упаковка" />
            <Step title="Передаём в Европочту" sub="появится трек-номер" />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tap style={s.plain} accessibilityRole="button"><Text style={s.plainText}>Поделиться статусом</Text></Tap>
            <Tap style={s.plain} accessibilityRole="button"><Text style={s.plainText}>Помощь</Text></Tap>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Step({ title, sub, done, now }: { title: string; sub: string; done?: boolean; now?: boolean }) {
  return (
    <View style={[s.row, !done && !now && { opacity: 0.45 }]} accessibilityLabel={`${title}${done ? ', готово' : now ? ', сейчас' : ''}`}>
      {done ? (
        <View style={s.okDot}><CheckIcon size={12} color="#fff" weight="bold" /></View>
      ) : (
        <View style={[s.dot, now && { borderWidth: 6, borderColor: colors.coralAction }]} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.small}>{sub}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 14 },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.75, color: colors.fg, paddingTop: 6 },
  emptyText: { fontSize: 16, lineHeight: 22, color: colors.mut },
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 12 },
  small: { fontSize: 13, color: colors.mut },
  stage: { fontSize: 30, fontWeight: '700', letterSpacing: -0.75, color: colors.fg },
  when: { fontSize: 17, fontWeight: '700', color: colors.fg },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13, color: colors.mut },
  labelOn: { color: colors.coralLink, fontWeight: '600' },
  live: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.bg, borderRadius: 16, padding: 12 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coralAction },
  liveTitle: { fontSize: 15, fontWeight: '600', color: colors.fg },
  group: { backgroundColor: colors.card, borderRadius: 22, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  okDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.mut2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.fg },
  plain: { flex: 1, height: 46, borderRadius: 14, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  plainText: { fontSize: 15, fontWeight: '600', color: colors.fg },
  btn: { height: 52, borderRadius: 16, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 17, fontWeight: '600', color: '#fff' },
});
