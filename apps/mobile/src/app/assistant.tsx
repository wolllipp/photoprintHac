/**
 * «Помощь» — тот же помощник picPac, что и в «Собрать книгу», и тот же интерфейс:
 * окно снизу, пустой экран с заголовком-наплывом, подсказки над полем, поле с голосом.
 * Запрос встаёт крупным заголовком, под ним — шаги строками «подпись — итог», ниже плитка ответа.
 * Брак: фото дефекта → проверка → перепечатка без возврата (A13). Решения — по правилам гарантии.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkDefect, quickAnswer, type ClaimVerdict } from '@/ai/assistant';
import { Composer } from '@/components/composer';
import { OverlapTitle } from '@/components/home';
import { Tap } from '@/components/ui';
import { useStore } from '@/data/store';
import { duration, ease, SuccessCheck, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const HINTS = [
  { label: 'Пришёл брак', text: 'Пришёл брак — на странице полоса через всё фото' },
  { label: 'Где мой заказ', text: 'Где мой заказ и когда он приедет?' },
  { label: 'Позвать человека', text: 'Позвать человека' },
];
const HEARD = 'На одной странице полоса через всю фотографию';

type Step = { label: string; now: string; done: string };
type Turn = {
  id: number;
  q: string;
  kind: 'defect' | 'answer';
  steps: Step[];
  step: number;
  answer: string;
  verdict?: ClaimVerdict;
  confirmed?: boolean;
};

export default function Assistant() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { orders } = useStore();
  const order = orders[0];
  const [turns, setTurns] = useState<Turn[]>([]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const last = turns[turns.length - 1];
  const busy = !!last && (last.step < last.steps.length || (last.kind === 'defect' && !last.verdict));

  // шаги — по очереди, как в «Собрать книгу»
  const lastId = last?.id;
  useEffect(() => {
    if (lastId === undefined) return;
    const t = setInterval(() => {
      setTurns((ts) => ts.map((x) => (x.id === lastId && x.step < x.steps.length ? { ...x, step: x.step + 1 } : x)));
      Haptics.selectionAsync().catch(() => {});
    }, 520);
    const stop = setTimeout(() => clearInterval(t), 520 * 4);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [lastId]);

  const send = async (q: string) => {
    const id = nextId.current++;
    const ord = order ? `№${order.id} · ${order.title}` : 'нет заказов';
    if (/брак|полос|дефект|испорч|порван/i.test(q)) {
      setTurns((ts) => [
        ...ts,
        {
          id,
          q,
          kind: 'defect',
          step: 0,
          answer: '',
          steps: [
            { label: 'Заказ', now: 'ищу', done: ord },
            { label: 'Фото дефекта', now: 'смотрю', done: 'полоса при печати' },
            { label: 'Решение', now: 'сверяю с гарантией', done: 'перепечатка' },
          ],
        },
      ]);
      const v = await checkDefect();
      setTurns((ts) =>
        ts.map((x) => (x.id === id ? { ...x, verdict: v, answer: `Это производственный брак: ${v.label}. Перепечатаем книгу бесплатно — старую возвращать не нужно.` } : x)),
      );
    } else {
      setTurns((ts) => [...ts, { id, q, kind: 'answer', step: 0, answer: quickAnswer(q), steps: [{ label: 'Заказ', now: 'смотрю', done: ord }] }]);
    }
  };
  const confirm = (id: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, confirmed: true } : x)));
  };

  const empty = turns.length === 0;

  return (
    <View style={s.screen}>
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <View style={{ width: 40 }} />
        {empty ? <View /> : <Animated.Text entering={FadeIn.duration(duration.fast)} style={s.headTitle}>Помощь</Animated.Text>}
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
          <XIcon size={16} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, empty && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => !empty && scroll.current?.scrollToEnd({ animated: true })}>
        {empty ? (
          <Animated.View exiting={FadeOut.duration(duration.quick)} style={s.hero}>
            <OverlapTitle text="Чем помочь?" size={64} maxWidth={width - 56} rgb="29,33,32" warm enter />
            <Animated.Text entering={FadeInDown.delay(260).duration(520).easing(ease.smoothOut)} style={s.sub}>
              Статус заказа, сроки, брак. Решаю по правилам гарантии, человек — в одно касание.
            </Animated.Text>
          </Animated.View>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} onConfirm={() => confirm(t.id)} />)
        )}
      </ScrollView>

      <Composer
        placeholder={empty ? 'Опишите, что случилось' : 'Ещё вопрос'}
        hints={empty ? HINTS : undefined}
        heard={HEARD}
        busy={busy}
        processing={busy}
        onSend={send}
        onPlus={() => send(HINTS[0].text)}
        plusLabel="Прислать фото дефекта"
      />
    </View>
  );
}

function TurnView({ turn, onConfirm }: { turn: Turn; onConfirm: () => void }) {
  const done = turn.step >= turn.steps.length && (turn.kind === 'answer' || !!turn.verdict);
  return (
    <View style={s.turn}>
      <Animated.Text entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.q}>
        {turn.q}
      </Animated.Text>

      <View style={{ gap: 6 }}>
        {turn.steps.map((st, i) =>
          i <= turn.step && i < turn.steps.length ? (
            <Animated.View key={i} entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.step}>
              <Text style={s.stepLabel}>{st.label}</Text>
              {i < turn.step ? (
                <Animated.Text entering={FadeIn.duration(duration.fast)} style={s.stepText} numberOfLines={1}>
                  {st.done}
                </Animated.Text>
              ) : (
                <ThinkingLine text={`${st.now}…`} style={s.stepNow} />
              )}
            </Animated.View>
          ) : null,
        )}
      </View>

      {done ? (
        <Animated.View entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.answer}>
          <Text style={s.answerLabel}>{turn.kind === 'defect' ? 'Перепечатка' : 'Ответ'}</Text>
          <Text style={s.answerText}>{turn.answer}</Text>
          {turn.verdict ? (
            turn.confirmed ? (
              <Animated.View entering={FadeIn} style={s.doneRow}>
                <SuccessCheck size={36} />
                <Text style={s.doneText}>Оформлено. Новая книга будет {turn.verdict.eta} — пришлю уведомление.</Text>
              </Animated.View>
            ) : (
              <>
                <View style={s.kv}>
                  <Text style={s.k}>Доставка</Text>
                  <Text style={s.v}>тем же способом</Text>
                </View>
                <View style={s.kv}>
                  <Text style={s.k}>Будет у вас</Text>
                  <Text style={s.v}>{turn.verdict.eta}</Text>
                </View>
                <Tap style={s.cta} onPress={onConfirm} accessibilityRole="button">
                  <Text style={s.ctaText}>Перепечатать бесплатно</Text>
                </Tap>
              </>
            )
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  headTitle: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 28 },
  hero: { alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  sub: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular, color: colors.mut, textAlign: 'center', maxWidth: 300 },

  turn: { gap: 14 },
  q: { fontSize: 23, lineHeight: 29, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  step: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.card, borderRadius: 18, height: 50, paddingHorizontal: 16 },
  stepLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  stepText: { flexShrink: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.fg, textAlign: 'right' },
  stepNow: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut, textAlign: 'right' },

  answer: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 10 },
  answerLabel: { fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.peachInk },
  answerText: { fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.fg },
  kv: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { fontSize: 14, fontFamily: fonts.regular, color: colors.mut },
  v: { fontSize: 14, fontFamily: fonts.bold, color: colors.fg },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneText: { flex: 1, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.medium, color: colors.fg },
});
