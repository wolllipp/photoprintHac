/**
 * «Собрать книгу» — диалог с ИИ в духе Perplexity, в визуальном языке корзины.
 * Открывается окном снизу поверх главной. Пусто — примеры фраз. Запрос встаёт крупным заголовком,
 * под ним по очереди шаги работы ИИ (с галочками и итогом), потом плитка ответа: название книги,
 * текст набирается по словам, лента найденных фото и «Показать вариант» с ценой — как «Оформить» в корзине.
 * Уточнения («сделай 32 страницы») — новыми блоками ниже (A2: доработка диалогом).
 * С микрофона главной окно открывается сразу в записи: слова появляются по ходу речи.
 * Ответы в демо — по правилам (src/ai/story.ts); в продукте — локальная модель (POST /projects/story).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpIcon, BookOpenTextIcon, CheckIcon, ImagesIcon, MicrophoneIcon, PlusIcon, SparkleIcon, WaveformIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, useWindowDimensions, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseStory, type ParsedStory } from '@/ai/story';
import { Tap } from '@/components/ui';
import { tariffs } from '@/data/demo';
import { pic, type PhotoName } from '@/data/photos';
import { rub } from '@/data/store';
import { OverlapTitle } from '@/components/home';
import { VoiceGlow } from '@/components/voiceGlow';
import { duration, ease, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

/** Короткие подсказки над полем: подпись на пилюле → полная фраза, которая отправится. */
const EXAMPLES = [
  { label: 'Поездка в Карелию', text: 'Поездка в Карелию, тёплая, 24 страницы, больше пейзажей' },
  { label: 'Первый год сына', text: 'Первый год сына, светлая книга на 32 страницы' },
  { label: 'Выпускной 11 «Б»', text: 'Выпускной 11 «Б» — все фото класса, 40 страниц' },
];
/** Что «услышала» диктовка в демо (в продукте — распознавание речи в локальном контуре). */
const HEARD = 'Книга про лето на даче с бабушкой, светлая, 20 страниц, больше людей';
const FOUND: PhotoName[] = ['night-window', 'city-sunset', 'friends-night', 'cafe-dessert', 'roses'];

const KIND: Record<string, string> = {
  Путешествие: 'книгу о поездке',
  Ребёнок: 'детскую книгу',
  Свадьба: 'свадебную книгу',
  Выпускной: 'выпускной альбом',
  'Новый год': 'новогоднюю книгу',
};
const pagesWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'страницы' : n % 10 === 1 && n % 100 !== 11 ? 'страницу' : 'страниц');
function answerText(p: ParsedStory) {
  const mood = [p.tone ? `${p.tone.replace(/ый$/, 'ые').replace(/ий$/, 'ие')} тона` : null, p.accent].filter(Boolean).join(', ');
  return `Соберём ${KIND[p.themeLabel] ?? 'книгу'} на ${p.pages} ${pagesWord(p.pages)}${mood ? `: ${mood}` : ''}. Из ${p.photos} фото оставим лучшие — без дублей и смазанных, лица в обрез не попадут.`;
}

type Turn = { id: number; q: string; parsed: ParsedStory; step: number; text: string; done: boolean };
const STEP_MS = 380;

export default function Story() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(Boolean(voice));
  const [heard, setHeard] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const busy = turns.some((t) => !t.done);
  const [kb, setKb] = useState(false);
  const root = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    // клавиатура поднимается вместе с окном — одно движение снизу
    const t = voice ? undefined : setTimeout(() => input.current?.focus(), 60);
    return () => {
      a.remove();
      b.remove();
      if (t) clearTimeout(t);
    };
  }, [voice]);
  const last = turns[turns.length - 1];

  // диктовка: слова появляются по ходу речи, свет внизу поднимается с каждым словом
  const level = useSharedValue(0);
  useEffect(() => {
    if (!listening) {
      level.value = withTiming(0, { duration: 300 });
      return;
    }
    const words = HEARD.split(' ');
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setHeard(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(t);
    }, 260);
    // shortcut: громкость имитируется; в продукте — уровень с микрофона (expo-audio, metering)
    const m = setInterval(() => {
      const speaking = i < words.length;
      level.value = withTiming(speaking ? 0.35 + Math.random() * 0.65 : 0.06 + Math.random() * 0.06, { duration: 110 });
    }, 110);
    return () => {
      clearInterval(t);
      clearInterval(m);
    };
  }, [listening, level]);

  // ход ответа на последний запрос: шаги по очереди, потом текст по словам
  const lastId = last?.id;
  const lastDone = last?.done;
  const lastParsed = last?.parsed; // тот же объект на весь ход ответа
  useEffect(() => {
    if (lastId === undefined || lastDone || !lastParsed) return;
    let step = 0;
    let t: ReturnType<typeof setInterval> | undefined;
    const steps = setInterval(() => {
      step += 1;
      setTurns((ts) => ts.map((x) => (x.id === lastId ? { ...x, step } : x)));
      Haptics.selectionAsync().catch(() => {});
      if (step >= 3) {
        clearInterval(steps);
        const words = answerText(lastParsed).split(' ');
        let i = 0;
        t = setInterval(() => {
          i += 1;
          setTurns((ts) => ts.map((x) => (x.id === lastId ? { ...x, text: words.slice(0, i).join(' '), done: i >= words.length } : x)));
          if (i >= words.length) {
            clearInterval(t);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
        }, 22);
      }
    }, STEP_MS);
    return () => {
      clearInterval(steps);
      if (t) clearInterval(t);
    };
    // перезапуск только при новом запросе: lastDone меняется в конце хода и сам ход не трогает
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, lastParsed]);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // все запросы вместе: последние уточнения важнее (числа берутся из них первыми)
    const all = [v, ...turns.map((t) => t.q).reverse()].join('. ');
    setTurns((ts) => [...ts, { id: nextId.current++, q: v, parsed: parseStory(all)!, step: 0, text: '', done: false }]);
    setText('');
    input.current?.blur();
  };
  const startVoice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    input.current?.blur();
    setHeard('');
    setListening(true);
  };
  const stopVoice = (keep: boolean) => {
    setListening(false);
    if (keep && heard) send(heard);
  };

  const empty = turns.length === 0;

  return (
    <View ref={root} style={s.screen}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* шапка окна: ручка, закрыть; в диалоге — заголовок мелко по центру */}
      <View style={[s.head, { paddingTop: insets.top + 6 }]}>
        <View style={s.headRow}>
          <View style={{ width: 36 }} />
          {empty ? <View /> : <Animated.Text entering={FadeIn.duration(duration.fast)} style={s.headTitle}>Собрать книгу</Animated.Text>}
          <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={8}>
            <XIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, empty && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => !empty && scroll.current?.scrollToEnd({ animated: true })}>
        {empty ? (
          // пустой экран: крупный заголовок по центру — экран не пустует
          <Animated.View exiting={FadeOut.duration(duration.quick)} style={s.hero}>
            {/* «СОБРАТЬ» — 7 широких заглавных; буква Unbounded ≈ 0,92 кегля, поля по 28 — так слово всегда влезает */}
            <OverlapTitle text="Собрать книгу" size={Math.min(64, Math.floor((width - 56) / (7 * 0.92)))} rgb="29,33,32" warm enter />
            <Animated.Text entering={FadeInDown.delay(260).duration(520).easing(ease.smoothOut)} style={s.sub}>
              Опишите книгу словами или голосом — соберём её из ваших фото.
            </Animated.Text>
          </Animated.View>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} />)
        )}
      </ScrollView>

      {/* свет снизу: поднимается с голосом, пока ИИ думает — ходит лучом */}
      <VoiceGlow active={listening} processing={busy && !listening} level={level} />

      {/* поле ввода у большого пальца; над ним — короткие подсказки, пока пусто */}
      <View style={[s.composerWrap, { paddingBottom: kb ? 8 : insets.bottom + 8 }]}>
        {empty && !listening ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.hintsRow} contentContainerStyle={s.hints}>
            {EXAMPLES.map((e) => (
              <Tap key={e.label} style={s.hint} onPress={() => send(e.text)} accessibilityRole="button" accessibilityLabel={`Пример: ${e.text}`}>
                <Text style={s.hintText}>{e.label}</Text>
              </Tap>
            ))}
          </ScrollView>
        ) : null}
        <View style={[s.composer, listening && s.composerVoice]}>
          {listening ? (
            <Animated.View key="wave" entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.quick)} style={{ gap: 18 }}>
              <Text style={[s.heard, !heard && { color: colors.mut2 }]} accessibilityLiveRegion="polite">
                {heard || 'Слушаю…'}
              </Text>
              <View style={s.bar}>
                <Tap style={s.ghost} onPress={() => stopVoice(false)} accessibilityRole="button" accessibilityLabel="Отменить запись">
                  <XIcon size={18} color={colors.fg} weight="bold" />
                </Tap>
                <Timer />
                <Tap style={s.send} onPress={() => stopVoice(true)} accessibilityRole="button" accessibilityLabel="Готово, отправить">
                  <CheckIcon size={18} color="#fff" weight="bold" />
                </Tap>
              </View>
            </Animated.View>
          ) : (
            <Animated.View key="text" entering={FadeIn.duration(duration.fast)} style={{ gap: 8 }}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                multiline
                placeholder={empty ? 'Какую книгу соберём?' : 'Уточните: «32 страницы», «меньше селфи»'}
                placeholderTextColor={colors.mut2}
                style={s.input}
                accessibilityLabel="Описание книги"
              />
              <View style={s.bar}>
                <Tap style={s.ghost} onPress={() => router.push('/select')} accessibilityRole="button" accessibilityLabel="Выбрать фото">
                  <PlusIcon size={18} color={colors.fg} weight="bold" />
                </Tap>
                <View style={{ flex: 1 }} />
                <Tap style={s.ghostFlat} onPress={startVoice} accessibilityRole="button" accessibilityLabel="Надиктовать">
                  <MicrophoneIcon size={20} color={colors.fg} />
                </Tap>
                {text.trim() ? (
                  <Tap style={[s.send, busy && { opacity: 0.35 }]} onPress={() => send(text)} disabled={busy} accessibilityRole="button" accessibilityLabel="Отправить">
                    <ArrowUpIcon size={18} color="#fff" weight="bold" />
                  </Tap>
                ) : (
                  <Tap style={s.send} onPress={startVoice} accessibilityRole="button" accessibilityLabel="Голосовой режим">
                    <WaveformIcon size={18} color="#fff" weight="bold" />
                  </Tap>
                )}
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
    </View>
  );
}

/** Один запрос: крупный заголовок → шаги ИИ → плитка ответа. */
function TurnView({ turn }: { turn: Turn }) {
  const p = turn.parsed;
  const steps: { icon: ReactNode; now: string; done: string }[] = [
    { icon: <ImagesIcon size={16} color={colors.peachInk} weight="fill" />, now: 'Ищу фото по описанию', done: `${p.photos} фото · «${p.album}»` },
    { icon: <SparkleIcon size={16} color={colors.peachInk} weight="fill" />, now: 'Отбираю лучшие кадры', done: 'без дублей и смазанных' },
    { icon: <BookOpenTextIcon size={16} color={colors.peachInk} weight="fill" />, now: 'Подбираю объём и шаблон', done: `${p.pages} стр. · Classic 20×20` },
  ];
  const price = tariffs[1].price;
  return (
    <View style={s.turn}>
      <Animated.Text entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.q}>
        {turn.q}
      </Animated.Text>

      <View style={s.steps}>
        {steps.map((st, i) =>
          i <= turn.step ? (
            <Animated.View key={i} entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.step}>
              <View style={s.stepIco}>{st.icon}</View>
              {i < turn.step ? (
                <>
                  <Text style={s.stepText} numberOfLines={1}>{st.done}</Text>
                  <Animated.View entering={ZoomIn.duration(duration.fast)} style={s.ok}>
                    <CheckIcon size={11} color="#fff" weight="bold" />
                  </Animated.View>
                </>
              ) : (
                <ThinkingLine text={`${st.now}…`} style={s.stepNow} />
              )}
            </Animated.View>
          ) : null,
        )}
      </View>

      {turn.step >= 3 ? (
        <Animated.View entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.answer}>
          <Text style={s.answerTitle}>{p.album}</Text>
          <Text style={s.answerText}>{turn.text}</Text>

          {turn.done ? (
            <Animated.View entering={FadeIn.duration(duration.fast)} style={{ gap: 12 }}>
              {/* найденные фото — как источники */}
              <View style={s.found}>
                {FOUND.map((k, i) => (
                  <Image key={k} source={pic(k)} style={[s.foundImg, { marginLeft: i ? -10 : 0, zIndex: 10 - i }]} contentFit="cover" />
                ))}
                <Text style={s.foundMore}>+{p.photos - FOUND.length} фото</Text>
              </View>

              <Tap style={s.cta} onPress={() => router.push('/build')} accessibilityRole="button" accessibilityLabel={`Показать вариант, от ${rub(price)}`}>
                <Text style={s.ctaText}>Показать вариант</Text>
                <View style={s.ctaSum}>
                  <Text style={s.ctaPrice}>от {rub(price)}</Text>
                </View>
              </Tap>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Timer() {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={s.timer}>
      <View style={s.rec} />
      <Text style={s.timerText}>{`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingBottom: 6, alignItems: 'center', gap: 6 },
  grab: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  headTitle: { fontSize: 17, fontFamily: fonts.semibold, color: colors.fg },
  hero: { alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  title: { fontSize: 46, lineHeight: 50, fontFamily: fonts.display, letterSpacing: -1.4, color: colors.fg, textAlign: 'center' },
  sub: { fontSize: 16, lineHeight: 22, fontFamily: fonts.regular, color: colors.mut, textAlign: 'center', maxWidth: 300 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 28 },

  hintsRow: { marginHorizontal: -12, flexGrow: 0, marginBottom: 8 },
  hints: { paddingHorizontal: 12, gap: 6 },
  hint: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' },
  hintText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },

  turn: { gap: 14 },
  q: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold, letterSpacing: -0.3, color: colors.fg },
  steps: { gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 10 },
  stepIco: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.fg },
  stepNow: { fontSize: 14.5, fontFamily: fonts.medium, color: colors.mut },
  ok: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },

  answer: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 8 },
  answerTitle: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  answerText: { fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.fg, minHeight: 23 },
  found: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  foundImg: { width: 42, height: 42, borderRadius: 12, borderWidth: 2, borderColor: colors.card },
  foundMore: { marginLeft: 10, fontSize: 14, fontFamily: fonts.semibold, color: colors.mut },
  cta: { height: 58, borderRadius: 29, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 8 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  ctaSum: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  ctaPrice: { fontSize: 16, fontFamily: fonts.display, letterSpacing: -0.3, color: '#fff' },

  composerWrap: { paddingHorizontal: 12, paddingTop: 6 },
  composerVoice: { backgroundColor: 'transparent', paddingTop: 24 },
  composer: { backgroundColor: colors.card, borderRadius: 26, padding: 12, paddingBottom: 10 },
  input: { fontSize: 17, lineHeight: 23, fontFamily: fonts.medium, color: colors.fg, minHeight: 28, maxHeight: 120, padding: 0, paddingHorizontal: 4 },
  heard: { fontSize: 22, lineHeight: 29, fontFamily: fonts.medium, letterSpacing: -0.3, color: colors.fg, textAlign: 'center', paddingHorizontal: 12, minHeight: 58 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghost: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghostFlat: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  timer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rec: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coralAction },
  timerText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },
});
