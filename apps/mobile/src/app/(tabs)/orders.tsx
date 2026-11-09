/**
 * Заказы — статус наглядно: обложка, этап крупно, «будет …», шкала из пяти точек на одной линии
 * (пройденные — коралловые, текущая пульсирует), живая строка «что сейчас». Под заказом —
 * «На экран блокировки» (превью Live Activity) и «Помощь». Ниже — все заказы.
 * Этапы и прогресс в продукте приходят из GET /orders/{id} (order_stages, production_progress).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChatCircleTextIcon, DeviceMobileIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { rub, useStore, type PlacedOrder } from '@/data/store';
import { ease, SuccessCheck } from '@/motion';
import { colors, fonts } from '@/theme';

const STAGES = ['Принят', 'Проверен', 'Печать', 'В пути', 'Готов'];
const NOW = ['Принят', 'Проверяем макет', 'Печатаем', 'В пути', 'Можно забирать'];

export default function Orders() {
  const insets = useSafeAreaInsets();
  const { orders, markSeen } = useStore();
  const [lock, setLock] = useState(false);
  const [onLock, setOnLock] = useState<string | null>(null);
  const order = orders[0];
  const fresh = order?.fresh ?? false;
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(markSeen, 6000);
    return () => clearTimeout(t);
  }, [fresh, markSeen]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Заказы</Text>

        {fresh ? (
          <Animated.View entering={FadeInDown.duration(420).easing(ease.smoothOut)} style={s.paid}>
            <SuccessCheck size={32} />
            <Text style={s.paidText}>Оплачено. Книга уже в очереди на печать</Text>
          </Animated.View>
        ) : null}

        {!order ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>Заказов пока нет</Text>
            <Text style={s.emptyText}>Оформленные книги появятся здесь — со статусом печати и доставки.</Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(60).duration(420).easing(ease.smoothOut)}>
              <OrderCard order={order} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).duration(420).easing(ease.smoothOut)} style={s.actions}>
              <Tap style={[s.btn, s.btnMain]} onPress={() => setLock(true)} accessibilityRole="button">
                <DeviceMobileIcon size={18} color="#fff" weight="bold" />
                <Text style={[s.btnText, { color: '#fff' }]}>{onLock === order.id ? 'На экране блокировки' : 'На экран блокировки'}</Text>
              </Tap>
              <Tap style={s.btn} onPress={() => router.push('/assistant')} accessibilityRole="button">
                <ChatCircleTextIcon size={18} color={colors.fg} weight="bold" />
                <Text style={s.btnText}>Помощь</Text>
              </Tap>
            </Animated.View>

            {orders.length > 1 ? (
              <Animated.View entering={FadeInDown.delay(180).duration(420).easing(ease.smoothOut)} style={{ gap: 8 }}>
                <Text style={s.h2}>Все заказы</Text>
                {orders.slice(1).map((o) => (
                  <View key={o.id} style={s.row}>
                    <Image source={pic(o.cover)} style={s.rowCover} contentFit="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{o.title}</Text>
                      <Text style={s.rowSub}>№{o.id} · {STAGES[o.stage].toLowerCase()}</Text>
                    </View>
                    <Text style={s.rowSum}>{rub(o.total)}</Text>
                  </View>
                ))}
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* превью статуса на экране блокировки (Live Activity) */}
      <Modal visible={lock} transparent animationType="fade" onRequestClose={() => setLock(false)}>
        {order ? (
          <LockPreview
            order={order}
            added={onLock === order.id}
            onAdd={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setOnLock(order.id);
            }}
            onClose={() => setLock(false)}
          />
        ) : null}
      </Modal>
    </View>
  );
}

/** Карточка заказа: обложка, название, этап крупно, «будет …», шкала и живая строка. */
function OrderCard({ order }: { order: PlacedOrder }) {
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Image source={pic(order.cover)} style={s.cover} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle} numberOfLines={1}>{order.title}</Text>
          <Text style={s.cardSub}>№{order.id} · {order.tariffName} · {rub(order.total)}</Text>
        </View>
      </View>

      <View style={s.statusRow}>
        <Text style={s.stage}>{NOW[order.stage]}</Text>
        <Text style={s.eta}>будет {order.readyBy}</Text>
      </View>

      <Track stage={order.stage} />

      <View style={s.live}>
        <LiveDot />
        <Text style={s.liveText} numberOfLines={2}>{order.live}</Text>
      </View>
    </View>
  );
}

/** Шкала: пять точек на одной линии; пройденное — коралловое, текущая точка пульсирует. */
function Track({ stage }: { stage: number }) {
  return (
    <View>
      <View style={s.track}>
        <View style={s.line} />
        <View style={[s.line, s.lineDone, { width: `${(stage / (STAGES.length - 1)) * 100}%` }]} />
        {STAGES.map((st, i) => (
          <View key={st} style={s.nodeWrap}>
            {i === stage ? <Pulse /> : null}
            <View style={[s.node, i <= stage && s.nodeDone, i === stage && s.nodeNow]} />
          </View>
        ))}
      </View>
      <View style={s.labels}>
        {STAGES.map((st, i) => (
          <Text key={st} style={[s.label, i === stage && s.labelNow, i < stage && { color: colors.fg }]} numberOfLines={1}>
            {st}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Pulse() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
  }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - v.value), transform: [{ scale: 1 + v.value * 1.4 }] }));
  return <Animated.View style={[s.pulse, a]} />;
}

function LiveDot() {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * v.value }));
  return <Animated.View style={[s.liveDot, a]} />;
}

/** Как статус будет выглядеть на заблокированном iPhone. В продукте — Live Activity (нужна нативная сборка). */
function LockPreview({ order, added, onAdd, onClose }: { order: PlacedOrder; added: boolean; onAdd: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.lockScreen}>
      <Tap style={[s.lockClose, { top: insets.top + 8 }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
        <XIcon size={18} color="#fff" weight="bold" />
      </Tap>
      <Text style={s.lockTime}>9:41</Text>
      <Text style={s.lockDate}>вторник, 10 ноября</Text>

      <Animated.View entering={FadeInDown.delay(150).duration(500).easing(ease.smoothOut)} style={s.activity}>
        <View style={s.actHead}>
          <Image source={pic(order.cover)} style={s.actCover} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={s.actTitle} numberOfLines={1}>{order.title}</Text>
            <Text style={s.actSub}>picPac · будет {order.readyBy}</Text>
          </View>
          <Text style={s.actStage}>{NOW[order.stage]}</Text>
        </View>
        <View style={s.actBar}>
          <View style={[s.actFill, { width: `${((order.stage + 0.5) / STAGES.length) * 100}%` }]} />
        </View>
      </Animated.View>

      <View style={{ flex: 1 }} />
      <View style={[s.lockBottom, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={s.lockHint}>Статус обновляется сам: печать, отправка, «можно забирать». Без открытия приложения.</Text>
        {added ? (
          <Animated.View entering={FadeIn.duration(250)} style={[s.lockBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Text style={s.lockBtnText}>Добавлено на экран блокировки</Text>
          </Animated.View>
        ) : (
          <Tap style={s.lockBtn} onPress={onAdd} accessibilityRole="button">
            <Text style={s.lockBtnText}>Добавить</Text>
          </Tap>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 36, lineHeight: 42, fontFamily: fonts.display, letterSpacing: -0.9, color: colors.fg, paddingTop: 6 },
  h2: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 6 },

  paid: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.peach, borderRadius: 22, padding: 14 },
  paidText: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },

  card: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 52, height: 60, borderRadius: 12 },
  cardTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.fg },
  cardSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  stage: { flexShrink: 1, fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.7, color: colors.fg },
  eta: { fontSize: 16, fontFamily: fonts.bold, color: colors.coralAction },

  track: { height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  line: { position: 'absolute', left: 7, right: 7, height: 4, borderRadius: 2, backgroundColor: colors.card2 },
  lineDone: { right: undefined, backgroundColor: colors.coralAction, maxWidth: '96%' },
  nodeWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  node: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.card2, borderWidth: 3, borderColor: colors.card },
  nodeDone: { backgroundColor: colors.coralAction },
  nodeNow: { width: 18, height: 18, borderRadius: 9, borderWidth: 4, borderColor: '#fff' },
  pulse: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.coralAction },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  label: { width: 64, marginHorizontal: -25, textAlign: 'center', fontSize: 12, fontFamily: fonts.medium, color: colors.mut2 },
  labelNow: { color: colors.coralAction, fontFamily: fonts.bold },

  live: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coralAction },
  liveText: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.fg },

  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 50, borderRadius: 25, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnMain: { flex: 1.5, backgroundColor: colors.coralAction },
  btnText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, padding: 10, paddingRight: 16 },
  rowCover: { width: 44, height: 52, borderRadius: 10 },
  rowTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  rowSum: { fontSize: 15, fontFamily: fonts.display, color: colors.fg },

  empty: { backgroundColor: colors.card, borderRadius: 26, padding: 20, gap: 6 },
  emptyTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.fg },
  emptyText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },

  lockScreen: { flex: 1, backgroundColor: '#1E2A33', alignItems: 'center', paddingHorizontal: 16 },
  lockClose: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  lockTime: { marginTop: 110, fontSize: 84, lineHeight: 92, fontFamily: fonts.semibold, color: '#fff', letterSpacing: -2 },
  lockDate: { fontSize: 17, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.8)' },
  activity: { alignSelf: 'stretch', marginTop: 36, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 26, padding: 14, gap: 12 },
  actHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actCover: { width: 40, height: 46, borderRadius: 9 },
  actTitle: { fontSize: 15, fontFamily: fonts.bold, color: '#fff' },
  actSub: { fontSize: 12.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.7)' },
  actStage: { fontSize: 15, fontFamily: fonts.display, color: colors.peachStrong },
  actBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  actFill: { height: 6, borderRadius: 3, backgroundColor: colors.peachStrong },
  lockBottom: { alignSelf: 'stretch', gap: 12 },
  lockHint: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  lockBtn: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  lockBtnText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
