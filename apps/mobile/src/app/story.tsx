/**
 * Путь Б, шаг 1 — «Собрать книгу»: описание словами или голосом → карточка «Поняли так» → «Собрать».
 * Поле ввода как в чате ИИ: «+» (добавить фото), микрофон (диктовка), чёрная круглая кнопка —
 * отправить, когда есть текст. При диктовке поле превращается в живую волну с таймером, ✕ и ✓.
 * ИИ ничего не решает молча: пользователь видит разбор и подтверждает его.
 */
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowUpIcon, BookOpenTextIcon, CaretRightIcon, CheckIcon, ImagesIcon, MicrophoneIcon, PlusIcon, SparkleIcon, TagIcon, WaveformIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseStory } from '@/ai/story';
import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { duration, ease, enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const CHIPS = ['Путешествие', 'Ребёнок', 'Свадьба', 'Выпускной', 'Новый год'];
const DEMO = 'Книга про поездку в Карелию, тёплая, на 24 страницы, больше пейзажей';
/** Что «услышала» диктовка в демо (в продукте — распознавание речи в локальном контуре). */
const HEARD = 'Книга про лето на даче с бабушкой, светлая, 20 страниц, больше людей';

export default function Story() {
  const insets = useSafeAreaInsets();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState(voice ? '' : DEMO);
  // правки пользователя поверх того, что понял ИИ
  const [themeO, setThemeO] = useState<string | null>(null);
  const [pagesO, setPagesO] = useState<number | null>(null);
  const [toneO, setToneO] = useState<string | null>(null);
  const [open, setOpen] = useState<'pages' | 'tone' | null>(null);
  const [listening, setListening] = useState(Boolean(voice));
  const [typing, setTyping] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const parsed = useMemo(() => (typing === null ? parseStory(text) : null), [text, typing]);
  const theme = themeO ?? (parsed && parsed.themeLabel !== 'Своя тема' ? parsed.themeLabel : null);
  const pages = pagesO ?? parsed?.pages ?? 24;
  const tone = toneO ?? parsed?.tone ?? 'спокойный';
  const toggle = (k: 'pages' | 'tone') => {
    Haptics.selectionAsync().catch(() => {});
    setOpen((o) => (o === k ? null : k));
  };

  // распознанный текст «печатается» в поле по словам
  useEffect(() => {
    if (typing === null) return;
    const words = typing.split(' ');
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setText(words.slice(0, i).join(' '));
      if (i >= words.length) {
        clearInterval(t);
        setTyping(null);
      }
    }, 70);
    return () => clearInterval(t);
  }, [typing]);

  const startVoice = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    input.current?.blur();
    setListening(true);
  };
  const stopVoice = (keep: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setListening(false);
    if (keep) {
      setText('');
      setTyping(HEARD);
    }
  };
  const submit = () => {
    if (!parsed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/build');
  };

  const hasText = text.trim().length > 0;

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={s.title}>Какую книгу соберём?</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
          {CHIPS.map((c) => (
            <Tap
              key={c}
              style={[s.chip, c === theme && s.chipOn]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setThemeO(c === theme ? null : c);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: c === theme }}>
              <Text style={[s.chipText, c === theme && s.chipTextOn]}>{c}</Text>
            </Tap>
          ))}
        </ScrollView>

        {/* поле как в чате: текст сверху, кнопки снизу */}
        <View style={s.composer}>
          {listening ? (
            <Animated.View key="wave" entering={FadeIn.duration(duration.fast)} exiting={FadeOut.duration(duration.quick)} style={{ gap: 14 }}>
              <Listening />
              <View style={s.bar}>
                <Tap style={s.ghost} onPress={() => stopVoice(false)} accessibilityRole="button" accessibilityLabel="Отменить диктовку">
                  <XIcon size={18} color={colors.fg} weight="bold" />
                </Tap>
                <Timer />
                <Tap style={s.send} onPress={() => stopVoice(true)} accessibilityRole="button" accessibilityLabel="Готово, вставить текст">
                  <CheckIcon size={18} color="#fff" weight="bold" />
                </Tap>
              </View>
            </Animated.View>
          ) : (
            <Animated.View key="text" entering={FadeIn.duration(duration.fast)} style={{ gap: 10 }}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Опишите тему, настроение и объём"
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
                  <MicrophoneIcon size={20} color={colors.fg} weight="regular" />
                </Tap>
                {hasText ? (
                  <Tap style={[s.send, !parsed && { opacity: 0.35 }]} onPress={submit} disabled={!parsed} accessibilityRole="button" accessibilityLabel="Собрать книгу">
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

        {parsed ? (
          <Animated.View entering={enterItem(0)} style={s.parse} accessibilityLabel="Поняли так">
            <Text style={s.lbl}>Поняли так</Text>
            <Row i={1} icon={<TagIcon size={18} color={colors.peachInk} weight="fill" />} title="Тема" sub={theme ? 'шаблон и подписи под повод' : 'выберите повод выше'} value={theme ?? '—'} />
            <Row i={2} icon={<ImagesIcon size={18} color={colors.peachInk} weight="fill" />} title="Фото" sub={`альбом «${parsed.album}»`} value={`${parsed.photos} фото`} onPress={() => router.push('/select')} />
            <Row i={3} icon={<BookOpenTextIcon size={18} color={colors.peachInk} weight="fill" />} title="Объём" sub="Classic 20×20 — подходит под кадры" value={`${pages} стр.`} onPress={() => toggle('pages')} expanded={open === 'pages'}>
              <Options items={PAGES.map(String)} value={String(pages)} suffix=" стр." onPick={(v) => setPagesO(Number(v))} />
            </Row>
            <Row i={4} icon={<SparkleIcon size={18} color={colors.peachInk} weight="fill" />} title="Настроение" sub={[tone, parsed.accent ?? 'лучшие кадры'].join(' · ')} onPress={() => toggle('tone')} expanded={open === 'tone'}>
              <Options items={TONES} value={tone} onPick={setToneO} />
            </Row>
            <Tap style={[s.btn, s.btnPrimary]} onPress={submit} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>Собрать книгу</Text>
            </Tap>
          </Animated.View>
        ) : listening ? (
          <Animated.Text entering={FadeIn.duration(duration.slow)} style={s.empty}>
            Говорите: о чём книга, какое настроение и сколько страниц.
          </Animated.Text>
        ) : typing !== null ? null : (
          <Text style={s.empty}>Например: «книга про первый год сына, светлая, 30 страниц». Мы подберём фото и шаблон.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Волна диктовки: столбики дышат с разной скоростью, как голос. */
const BARS = Array.from({ length: 34 }, (_, i) => 0.25 + (((i * 37) % 11) / 11) * 0.75);
function Listening() {
  return (
    <View style={s.wave} accessibilityLabel="Слушаю" accessibilityLiveRegion="polite">
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

const PAGES = [16, 20, 24, 32, 40];
const TONES = ['спокойный', 'тёплый', 'светлый', 'яркий'];

/** Строка разбора: нажал — раскрываются варианты, выбрал — значение меняется на месте. */
function Row({
  i,
  icon,
  title,
  sub,
  value,
  onPress,
  expanded,
  children,
}: {
  i: number;
  icon: ReactNode;
  title: string;
  sub: string;
  value?: string;
  onPress?: () => void;
  expanded?: boolean;
  children?: ReactNode;
}) {
  return (
    <Animated.View entering={enterItem(i)} layout={LinearTransition.duration(220).easing(ease.smoothOut)} style={s.prowWrap}>
      <Tap style={s.prow} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} accessibilityState={onPress ? { expanded } : undefined}>
        <View style={s.pico}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={s.ptitle}>{title}</Text>
          <Text style={s.psub} numberOfLines={1}>{sub}</Text>
        </View>
        {value ? <Text style={s.pval}>{value}</Text> : null}
        {onPress ? <CaretRightIcon size={14} color={colors.mut2} weight="bold" style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} /> : null}
      </Tap>
      {expanded ? (
        <Animated.View entering={FadeIn.duration(duration.fast)} style={s.opts}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function Options({ items, value, suffix = '', onPick }: { items: string[]; value: string; suffix?: string; onPick: (v: string) => void }) {
  return (
    <View style={s.optRow} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it === value;
        return (
          <Tap
            key={it}
            style={[s.opt, on && s.optOn]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(it);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}>
            <Text style={[s.optText, on && { color: '#fff' }]}>
              {it}
              {on ? suffix : ''}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 14 },
  title: { fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.7, color: colors.fg },
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  chips: { paddingHorizontal: 16, gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.fg },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  chipTextOn: { color: '#fff' },

  composer: { backgroundColor: colors.card, borderRadius: 28, padding: 14, paddingBottom: 12, minHeight: 150, justifyContent: 'space-between' },
  input: { fontSize: 18, lineHeight: 25, fontFamily: fonts.medium, color: colors.fg, minHeight: 76, textAlignVertical: 'top', padding: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ghost: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ghostFlat: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.fg, alignItems: 'center', justifyContent: 'center' },
  wave: { height: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  waveBar: { width: 3, height: 56, borderRadius: 2, backgroundColor: colors.fg },
  timer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  rec: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.coralAction },
  timerText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },

  parse: { backgroundColor: colors.card, borderRadius: 26, padding: 14, gap: 8 },
  lbl: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut, paddingLeft: 4 },
  prowWrap: { backgroundColor: colors.bg, borderRadius: 18, overflow: 'hidden' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  opts: { paddingHorizontal: 12, paddingBottom: 12 },
  optRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' },
  optOn: { backgroundColor: colors.fg },
  optText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  pico: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  ptitle: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  psub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  pval: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg, fontVariant: ['tabular-nums'] },
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  btnPrimary: { backgroundColor: colors.coralAction },
  btnPrimaryText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
  empty: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 21, color: colors.mut, paddingHorizontal: 4 },
});
