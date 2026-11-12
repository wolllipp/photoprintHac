/**
 * Заказы — каждый строкой: обложка, этап, «будет …», тонкая шкала этапов. Нажатие раскрывает
 * путь заказа по шагам и действия: «На экран блокировки» (превью Live Activity), «Проблема с заказом»,
 * «Заказать ещё». Только что оплаченный заказ раскрыт сразу.
 * Этапы и прогресс в продукте приходят из GET /orders/{id} (order_stages, production_progress).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CaretDownIcon, CheckIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { rub, useStore, type PlacedOrder } from '@/data/store';
import { ease, SuccessCheck } from '@/motion';
import { colors, fonts } from '@/theme';

const STAGES = ['Принят', 'Проверен', 'Печать', 'В пути', 'Готов'];
const NOW = ['Заказ принят', 'Проверяем макет', 'Печатаем', 'Едет к вам', 'Можно забирать'];
/** Что будет следующим шагом — строкой под полосой. */
const NEXT = ['проверим макет', 'печать', 'отправка', 'можно забирать', ''];
/** «Европочта · ПВЗ №112, Притыцкого, 29» → «ПВЗ №112». */
const place = (live: string) => live.split(' · ').pop()?.split(',')[0] ?? live;

export default function Orders() {
  const insets = useSafeAreaInsets();
  const { orders, markSeen, repeatOrder } = useStore();
  // какой заказ показываем на экране блокировки (превью)
  const [lock, setLock] = useState<PlacedOrder | null>(null);
  const [onLock, setOnLock] = useState<string | null>(null);
  // раскрыт только что оплаченный заказ; остальные — строками
  const [openId, setOpenId] = useState<string | null>(() => (orders[0]?.fresh ? orders[0].id : null));
  const order = orders[0];
  const active = orders.filter((o) => o.stage < 4 || o.fresh);
  const done = orders.filter((o) => o.stage >= 4 && !o.fresh);
  const fresh = order?.fresh ?? false;
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(markSeen, 6000);
    return () => clearTimeout(t);
  }, [fresh, markSeen]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 96 }]} showsVerticalScrollIndicator={false}>
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
            {/* в работе — строки со статусом; нажатие раскрывает путь заказа и действия */}
            {active.length ? <SectionTitle title="В работе" n={active.length} tone="coral" /> : null}
            {active.map((o, i) => (
              <Animated.View key={o.id} entering={FadeInDown.delay(60 + i * 50).duration(420).easing(ease.smoothOut)}>
                <OrderRow
                  order={o}
                  open={openId === o.id}
                  onToggle={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setOpenId((x) => (x === o.id ? null : o.id));
                  }}>
                  {o.stage < 4 ? (
                    <Tap style={[s.btnMain, onLock === o.id && s.btnDone]} onPress={() => setLock(o)} accessibilityRole="button">
                      <Text style={[s.btnText, { color: onLock === o.id ? colors.tealInk : '#fff' }]}>
                        {onLock === o.id ? 'Статус на экране блокировки' : 'Показывать на экране блокировки'}
                      </Text>
                    </Tap>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Tap style={s.btn} onPress={() => router.push('/assistant')} accessibilityRole="button">
                      <Text style={s.btnText}>Проблема с заказом</Text>
                    </Tap>
                    {o.items?.length ? (
                      <Tap
                        style={s.btn}
                        onPress={() => {
                          // тот же состав — сразу на оформление, корзины нет
                          repeatOrder(o.id);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          router.push('/checkout');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Заказать ещё раз то же самое">
                        <Text style={s.btnText}>Заказать ещё</Text>
                      </Tap>
                    ) : null}
                  </View>
                </OrderRow>
              </Animated.View>
            ))}

            {/* полученные — просто строкой: что, когда получен, сколько стоил и «Ещё раз»; раскрывать нечего */}
            {done.length ? <SectionTitle title="Полученные" n={done.length} tone="teal" /> : null}
            {done.length ? (
              <Animated.View entering={FadeInDown.delay(140).duration(420).easing(ease.smoothOut)} style={s.doneList}>
                {done.map((o, i) => (
                  <View key={o.id}>
                    {i ? <View style={s.doneLine} /> : null}
                    <View style={s.doneRow}>
                      <View>
                        <Image source={pic(o.cover)} style={s.doneCover} contentFit="cover" />
                        <View style={s.doneCheck}>
                          <CheckIcon size={10} color="#fff" weight="bold" />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.doneTitle} numberOfLines={1}>{o.title}</Text>
                        <Text style={s.cardSub} numberOfLines={1}>{o.live.split(' · ')[0]} · {rub(o.total)}</Text>
                      </View>
                      {o.items?.length ? (
                        <Tap
                          onPress={() => {
                            // тот же состав — сразу на оформление, корзины нет
                            repeatOrder(o.id);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            router.push('/checkout');
                          }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Заказать ещё «${o.title}»`}>
                          <Text style={s.doneLink}>Ещё раз</Text>
                        </Tap>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Animated.View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* превью статуса на экране блокировки (Live Activity) */}
      <Modal visible={lock !== null} transparent animationType="fade" onRequestClose={() => setLock(null)}>
        {lock ? (
          <LockPreview
            order={lock}
            added={onLock === lock.id}
            onAdd={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              setOnLock(lock.id);
            }}
            onClose={() => setLock(null)}
          />
        ) : null}
      </Modal>
    </View>
  );
}

/** Заголовок раздела со счётчиком в цветной пилюле: коралловый — в работе, бирюзовый — получены. */
function SectionTitle({ title, n, tone }: { title: string; n: number; tone: 'coral' | 'teal' }) {
  return (
    <View style={s.sec}>
      <Text style={s.h2}>{title}</Text>
      <View style={[s.secPill, { backgroundColor: tone === 'coral' ? colors.coralTint : colors.tealTint }]}>
        <Text style={[s.secPillText, { color: tone === 'coral' ? colors.coralAction : colors.tealInk }]}>{n}</Text>
      </View>
    </View>
  );
}

/**
 * Заказ строкой: обложка, этап и «будет …», название, тонкая шкала этапов.
 * Нажатие плавно раскрывает путь заказа по шагам и действия.
 */
function OrderRow({ order, open, onToggle, children }: { order: PlacedOrder; open: boolean; onToggle: () => void; children?: ReactNode }) {
  const ready = order.stage >= 4;
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 220 }) }] }));
  return (
    <Animated.View layout={LinearTransition.duration(260).easing(ease.smoothOut)} style={s.card}>
      <Tap onPress={onToggle} style={{ gap: 12 }} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${order.title}: ${NOW[order.stage]}${ready ? '' : `, будет ${order.readyBy}`}`}>
        {/* что за заказ — мелко; что сейчас — крупно; когда и где — строкой ниже */}
        <View style={s.cardHead}>
          <Text style={s.orderTitle} numberOfLines={1}>«{order.title}»</Text>
          <Animated.View style={turn}>
            <CaretDownIcon size={16} color={colors.mut} weight="bold" />
          </Animated.View>
        </View>
        <View style={{ gap: 2 }}>
          <Text style={[s.stage, ready && { color: colors.tealInk }]} numberOfLines={1}>{NOW[order.stage]}</Text>
          <Text style={s.eta} numberOfLines={1}>{ready ? place(order.live) : `будет ${order.readyBy} в ${place(order.live)}`}</Text>
        </View>
        {/* полоса из пяти отрезков: пройденные — коралловые, текущий — наполовину */}
        <View style={s.segs}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={s.seg}>
              <View style={[s.segFill, { width: i < order.stage || ready ? '100%' : i === order.stage ? '50%' : '0%' }, ready && { backgroundColor: colors.tealInk }]} />
            </View>
          ))}
        </View>
        <Text style={s.next} numberOfLines={1}>{ready ? 'заказ готов — заберите в течение 7 дней' : `дальше: «${NEXT[order.stage]}»${order.stage === 3 ? ' — придёт SMS' : ''}`}</Text>
      </Tap>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)} style={{ gap: 14 }}>
          <LinearGradient
            colors={['rgba(60,40,30,0)', 'rgba(60,40,30,0.2)', 'rgba(60,40,30,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.divider}
          />
          <Timeline order={order} />
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const time = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Путь заказа сверху вниз, как в Ozon: слева линия с точками, пройденное — коралловое,
 * текущая точка крупнее; у каждого этапа — где заказ, справа — когда он там был (или когда ожидаем).
 */
function Timeline({ order }: { order: PlacedOrder }) {
  const t0 = new Date(order.placedAt);
  const at = (days: number, h: number, m: number) => new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + days, h, m);
  const steps = [
    { title: 'Принят и оплачен', place: 'picPac · заказ №' + order.id, when: at(0, 14, 20) },
    { title: 'Макет проверен', place: 'лица в кадре, резкость в норме', when: at(0, 14, 32) },
    { title: 'Напечатан', place: 'Производство «Фотопринт», Минск', when: at(1, 11, 5) },
    { title: 'В пути', place: 'Европочта · сортировочный центр Минск', when: at(2, 9, 40) },
    { title: 'Можно забирать', place: order.live.includes('ПВЗ') ? order.live : 'Европочта · ПВЗ №112, Притыцкого, 29', when: at(3, 12, 0) },
  ];
  return (
    <View style={s.tl}>
      {steps.map((st, i) => {
        const past = i < order.stage;
        const now = i === order.stage;
        const last = i === steps.length - 1;
        return (
          <View key={st.title} style={s.tlRow}>
            <View style={s.tlRail}>
              <View style={[s.tlDot, (past || now) && s.tlDotDone, now && s.tlDotNow]} />
              {!last ? <View style={[s.tlLine, past && s.tlLineDone]} /> : null}
            </View>
            <View style={[s.tlBody, !last && { paddingBottom: 18 }]}>
              <View style={s.tlHead}>
                <Text style={[s.tlTitle, !past && !now && { color: colors.mut2 }, now && { color: colors.coralAction }]}>{st.title}</Text>
                <Text style={[s.tlWhen, now && { color: colors.coralAction }]}>
                  {past || now ? `${day(st.when)}, ${time(st.when)}` : `ожид. ${day(st.when)}`}
                </Text>
              </View>
              <Text style={[s.tlPlace, !past && !now && { color: colors.mut2 }]} numberOfLines={2}>
                {st.place}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
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

  card: { backgroundColor: colors.card, borderRadius: 24, padding: 14, gap: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  secPill: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secPillText: { fontSize: 13, fontFamily: fonts.bold },
  doneList: { borderRadius: 22, borderWidth: 1, borderColor: colors.hair, paddingHorizontal: 12 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  doneLine: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hair, marginLeft: 52 },
  doneCover: { width: 40, height: 48, borderRadius: 9, opacity: 0.9 },
  doneCheck: { position: 'absolute', right: -5, bottom: -5, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.bg, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  doneLink: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink },
  orderTitle: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  stage: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.5, color: colors.fg },
  eta: { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold, color: colors.coralAction },
  segs: { flexDirection: 'row', gap: 5 },
  seg: { flex: 1, height: 7, borderRadius: 4, backgroundColor: colors.card2, overflow: 'hidden' },
  segFill: { height: 7, borderRadius: 4, backgroundColor: colors.coralAction },
  next: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  cardSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
  divider: { height: 1, marginHorizontal: -12 },




  btn: { flex: 1, height: 52, borderRadius: 26, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  btnMain: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  btnDone: { backgroundColor: colors.tealTint },
  btnText: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  tl: { paddingTop: 2 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 18, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.card2, marginTop: 4 },
  tlDotDone: { backgroundColor: colors.coralAction },
  tlDotNow: { width: 18, height: 18, borderRadius: 9, marginTop: 1, borderWidth: 4, borderColor: '#fff', boxShadow: '0 0 0 1.5px rgba(184,79,75,0.35)' },
  tlLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: colors.card2, marginVertical: 2 },
  tlLineDone: { backgroundColor: colors.coralAction },
  tlBody: { flex: 1, gap: 2 },
  tlHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  tlTitle: { flexShrink: 1, fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg },
  tlWhen: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut, fontVariant: ['tabular-nums'] },
  tlPlace: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut },

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
