/**
 * «Собрать книгу» — диалог с ИИ, как ИИ-поиск: сверху заголовок, внизу поле ввода.
 * Пусто — примеры фраз (нажал — отправилось). Отправил — пузырь справа, слева «Смотрю фото…»,
 * потом ответ набирается по словам: что нашли и какую книгу соберём. Под ответом — «Показать вариант».
 * Можно уточнить следующим сообщением («сделай 32 страницы») — придёт новый ответ (A2: доработка диалогом).
 * С микрофона главной экран открывается сразу в записи: слова появляются по ходу речи.
 * Ответы в демо — по правилам (src/ai/story.ts); в продукте — локальная модель (POST /projects/story).
 */
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpIcon, BookOpenTextIcon, CheckIcon, MicrophoneIcon, PlusIcon, SparkleIcon, WaveformIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseStory, type ParsedStory } from '@/ai/story';
import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { duration, ease, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const EXAMPLES = [
  'Поездка в Карелию, тёплая, 24 страницы, больше пейзажей',
  'Первый год сына, светлая книга на 32 страницы',
  'Выпускной 11 «Б» — все фото класса, 40 страниц',
  'Наш год вдвоём, love story, 20 страниц',
];
/** Что «услышала» диктовка в демо (в продукте — распознавание речи в локальном контуре). */
const HEARD = 'Книга про лето на даче с бабушкой, светлая, 20 страниц, больше людей';

type Msg = { id: number; from: 'me' | 'ai'; text: string };

/** Ответ человеческим языком: что нашли и какую книгу соберём. */
const KIND: Record<string, string> = {
  Путешествие: 'книгу о поездке',
  Ребёнок: 'детскую книгу',
  Свадьба: 'свадебную книгу',
  Выпускной: 'выпускной альбом',
  'Новый год': 'новогоднюю книгу',
};
const pagesWord = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'страницы' : n % 10 === 1 && n % 100 !== 11 ? 'страницу' : 'страниц');
function reply(p: ParsedStory) {
  const mood = [p.tone ? `${p.tone.replace(/ый$/, 'ые').replace(/ий$/, 'ие')} тона` : null, p.accent].filter(Boolean).join(', ');
  const kind = KIND[p.themeLabel] ?? 'книгу';
  return `Нашлось ${p.photos} фото — альбом «${p.album}». Соберём ${kind} на ${p.pages} ${pagesWord(p.pages)}${mood ? `: ${mood}` : ''}. Лучшие кадры отберём, лица в обрез не попадут.`;
}

export default function Story() {
  const insets = useSafeAreaInsets();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(Boolean(voice));
  const [heard, setHeard] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);

  // все сообщения человека вместе: последние уточнения важнее (числа берутся из них первыми)
  const mine = msgs.filter((m) => m.from === 'me').map((m) => m.text);
  const parsed = mine.length ? parseStory([...mine].reverse().join('. ')) : null;
  const answered = msgs.length > 0 && msgs[msgs.length - 1].from === 'ai' && !thinking;

  // диктовка: слова появляются по ходу речи
  useEffect(() => {
    if (!listening) return;
    const words = HEARD.split(' ');
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setHeard(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(t);
    }, 260);
    return () => clearInterval(t);
  }, [listening]);

  // ответ ИИ: пауза «Смотрю фото…», потом текст набирается по словам
  useEffect(() => {
    if (!thinking || !parsed) return;
    const full = reply(parsed);
    const words = full.split(' ');
    let i = 0;
    let t: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      const id = nextId.current++;
      setMsgs((m) => [...m, { id, from: 'ai', text: '' }]);
      t = setInterval(() => {
        i += 1;
        setMsgs((m) => m.map((x) => (x.id === id ? { ...x, text: words.slice(0, i).join(' ') } : x)));
        if (i >= words.length) {
          clearInterval(t);
          setThinking(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }, 45);
    }, 1300);
    return () => {
      clearTimeout(start);
      if (t) clearInterval(t);
    };
    // ответ запускается один раз на каждое новое сообщение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking]);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || thinking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMsgs((m) => [...m, { id: nextId.current++, from: 'me', text: v }]);
    setText('');
    setThinking(true);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
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

  const empty = msgs.length === 0;

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="Собрать книгу" />

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, empty && { flexGrow: 1, justifyContent: 'flex-end' }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        onContentSizeChange={() => !empty && scroll.current?.scrollToEnd({ animated: true })}>
        {empty ? (
          <Animated.View entering={FadeIn.duration(duration.slow)} style={{ gap: 14 }}>
            <Text style={s.lead}>Опишите книгу словами или голосом — соберём её из ваших фото.</Text>
            <View style={{ gap: 8 }}>
              {EXAMPLES.map((e, i) => (
                <Animated.View key={e} entering={FadeInDown.delay(80 * i).duration(duration.slow).easing(ease.smoothOut)}>
                  <Tap style={s.example} onPress={() => send(e)} accessibilityRole="button" accessibilityLabel={`Пример: ${e}`}>
                    <Text style={s.exampleText}>{e}</Text>
                    <ArrowUpIcon size={14} color={colors.mut} weight="bold" style={{ transform: [{ rotate: '45deg' }] }} />
                  </Tap>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : (
          msgs.map((m) =>
            m.from === 'me' ? (
              <Animated.View key={m.id} entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.mine}>
                <Text style={s.mineText}>{m.text}</Text>
              </Animated.View>
            ) : (
              <Animated.View key={m.id} entering={FadeIn.duration(duration.fast)} style={s.ai}>
                <View style={s.aiHead}>
                  <View style={s.aiAvatar}>
                    <SparkleIcon size={12} color="#fff" weight="fill" />
                  </View>
                  <Text style={s.aiName}>picPac</Text>
                </View>
                <Text style={s.aiText}>{m.text}</Text>
              </Animated.View>
            ),
          )
        )}

        {thinking && msgs[msgs.length - 1]?.from === 'me' ? (
          <Animated.View entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.quick)} style={s.ai}>
            <View style={s.aiHead}>
              <View style={s.aiAvatar}>
                <SparkleIcon size={12} color="#fff" weight="fill" />
              </View>
              <ThinkingLine text="Смотрю фото…" style={s.aiThinking} />
            </View>
          </Animated.View>
        ) : null}

        {answered ? (
          <Animated.View entering={FadeInDown.duration(duration.slow).easing(ease.smoothOut)} style={{ gap: 8 }}>
            <Tap style={s.show} onPress={() => router.push('/build')} accessibilityRole="button">
              <BookOpenTextIcon size={18} color="#fff" weight="fill" />
              <Text style={s.showText}>Показать вариант</Text>
            </Tap>
            <Text style={s.tip}>Хотите иначе — напишите, что поменять: «32 страницы», «поменьше селфи».</Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* поле ввода у большого пальца */}
      <View style={[s.composerWrap, { paddingBottom: insets.bottom + 8 }]}>
        <View style={s.composer}>
          {listening ? (
            <Animated.View key="wave" entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.quick)} style={{ gap: 10 }}>
              <Text style={[s.heard, !heard && { color: colors.mut2 }]} accessibilityLiveRegion="polite">
                {heard || 'Слушаю…'}
              </Text>
              <Listening />
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
                autoFocus={!voice}
                placeholder={empty ? 'Какую книгу соберём?' : 'Уточните, что поменять'}
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
                  <Tap style={[s.send, thinking && { opacity: 0.35 }]} onPress={() => send(text)} disabled={thinking} accessibilityRole="button" accessibilityLabel="Отправить">
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
  );
}

/** Волна диктовки: столбики дышат с разной скоростью, как голос. */
const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + (((i * 37) % 11) / 11) * 0.75);
function Listening() {
  return (
    <View style={s.wave} accessibilityElementsHidden>
      {BARS.map((h, i) => (
        <Bar key={i} peak={h} speed={380 + ((i * 53) % 5) * 90} />
      ))}
    </View>
  );
}
function Bar({ peak, speed }: { peak: number; speed: number }) {
  const v = useSharedValue(0.2);
  useEffect(() => {
    v.value = withRepeat(withSequence(withTiming(peak, { duration: speed }), withTiming(0.15, { duration: speed })), -1, false, undefined, ReduceMotion.System);
  }, [peak, speed, v]);
  const a = useAnimatedStyle(() => ({ transform: [{ scaleY: v.value }] }));
  return <Animated.View style={[s.waveBar, a]} />;
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
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 14 },

  lead: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  example: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  exampleText: { flex: 1, fontSize: 15, lineHeight: 20, fontFamily: fonts.medium, color: colors.fg },

  mine: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: colors.fg, borderRadius: 22, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
  mineText: { fontSize: 16, lineHeight: 22, fontFamily: fonts.medium, color: '#fff' },
  ai: { alignSelf: 'stretch', gap: 6, paddingRight: 24 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  aiName: { fontSize: 13, fontFamily: fonts.bold, color: colors.fg },
  aiThinking: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  aiText: { fontSize: 17, lineHeight: 25, fontFamily: fonts.regular, color: colors.fg },

  show: { alignSelf: 'flex-start', height: 50, paddingHorizontal: 20, borderRadius: 25, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', gap: 8 },
  showText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
  tip: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut },

  composerWrap: { paddingHorizontal: 12, paddingTop: 6, backgroundColor: colors.bg },
  composer: { backgroundColor: colors.card, borderRadius: 26, padding: 12, paddingBottom: 10 },
  input: { fontSize: 17, lineHeight: 23, fontFamily: fonts.medium, color: colors.fg, minHeight: 28, maxHeight: 120, padding: 0, paddingHorizontal: 4 },
  heard: { fontSize: 17, lineHeight: 23, fontFamily: fonts.medium, color: colors.fg, paddingHorizontal: 4, minHeight: 23 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghost: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghostFlat: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.fg, alignItems: 'center', justifyContent: 'center' },
  wave: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  waveBar: { width: 3, height: 36, borderRadius: 2, backgroundColor: colors.fg },
  timer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rec: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coralAction },
  timerText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },
});
