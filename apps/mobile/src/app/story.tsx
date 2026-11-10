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
import { XIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useWindowDimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseStory, type ParsedStory } from '@/ai/story';
import { Tap } from '@/components/ui';
import { bookPrice, fitFormat, tariffs } from '@/data/demo';
import { pic, type PhotoName } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { OverlapTitle } from '@/components/home';
import { Composer, type ComposerHandle } from '@/components/composer';
import { ConsentSheet } from '@/components/consent';
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
function answerText(p: ParsedStory, sp: Spec) {
  const mood = [p.tone ? `${p.tone.replace(/ый$/, 'ые').replace(/ий$/, 'ие')} тона` : null, p.accent].filter(Boolean).join(', ');
  const pages = sp.spreads * 2;
  return `Соберём ${KIND[p.themeLabel] ?? 'книгу'} ${sp.format}: ${sp.spreads} разворотов, ${pages} ${pagesWord(pages)}, ${sp.lam} ламинация${mood ? `. Настроение — ${mood}` : ''}. Из ${p.photos} фото оставим лучшие — без дублей и смазанных, лица в обрез не попадут.`;
}

/** Что спрашиваем перед сборкой: формат (у Classic — два), ламинация, сколько разворотов. */
type Spec = { format: '20×20' | '21×30'; lam: 'глянцевая' | 'зернистая'; spreads: number };
const FORMATS: Spec['format'][] = ['20×20', '21×30'];
const LAMS: Spec['lam'][] = ['глянцевая', 'зернистая'];
const SPREADS = [10, 12, 15, 20];
const nearest = (n: number) => SPREADS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

type Turn = { id: number; q: string; parsed: ParsedStory; step: number; spec: Spec | null; text: string; done: boolean };
const STEP_MS = 380;

export default function Story() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [turns, setTurns] = useState<Turn[]>([]);
  const composer = useRef<ComposerHandle>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextId = useRef(1);
  const busy = turns.some((t) => !t.done);
  const last = turns[turns.length - 1];

  // ход ответа на последний запрос: шаги по очереди, потом текст по словам
  const lastId = last?.id;
  const lastDone = last?.done;
  const lastParsed = last?.parsed; // тот же объект на весь ход ответа
  useEffect(() => {
    if (lastId === undefined || lastDone || !lastParsed) return;
    let step = 0;
    const steps = setInterval(() => {
      step += 1;
      setTurns((ts) => ts.map((x) => (x.id === lastId ? { ...x, step } : x)));
      Haptics.selectionAsync().catch(() => {});
      if (step >= 3) clearInterval(steps);
    }, STEP_MS);
    return () => clearInterval(steps);
    // перезапуск только при новом запросе: lastDone меняется в конце хода и сам ход не трогает
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, lastParsed]);

  // ответ — когда шаги прошли и параметры книги выбраны (на первый запрос ИИ их спрашивает)
  const lastReady = (last?.step ?? 0) >= 3 && !!last?.spec;
  const lastSpec = last?.spec;
  useEffect(() => {
    if (lastId === undefined || !lastReady || lastDone || !lastParsed || !lastSpec) return;
    const words = answerText(lastParsed, lastSpec).split(' ');
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTurns((ts) => ts.map((x) => (x.id === lastId ? { ...x, text: words.slice(0, i).join(' '), done: i >= words.length } : x)));
      if (i >= words.length) {
        clearInterval(t);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }, 22);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, lastReady, lastSpec]);
  const confirm = (id: number, spec: Spec) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, spec } : x)));
  };

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    // все запросы вместе: последние уточнения важнее (числа берутся из них первыми)
    const all = [v, ...turns.map((t) => t.q).reverse()].join('. ');
    const parsed = parseStory(all)!;
    const prev = turns[turns.length - 1]?.spec ?? null;
    // уточнение с числом страниц меняет развороты, остальное — как выбрали
    const spec = prev ? { ...prev, spreads: /\d{2,3}\s*(стр|страниц)/i.test(v) ? nearest(parsed.pages / 2) : prev.spreads } : null;
    setTurns((ts) => [...ts, { id: nextId.current++, q: v, parsed, step: 0, spec, text: '', done: false }]);
  };
  // перед первой сборкой — согласие на обработку фото ИИ (A14), один раз
  const { aiConsent, setAiConsent } = useStore();
  const [ask, setAsk] = useState<Record<string, string> | null>(null);
  const show = (params: Record<string, string>) => (aiConsent ? router.push({ pathname: '/build', params }) : setAsk(params));

  const empty = turns.length === 0;

  return (
    <View style={s.screen}>
    <View style={{ flex: 1 }}>
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
            {/* кегль подстраивается под реальную ширину строки на этом телефоне */}
            <OverlapTitle text="Собрать книгу" size={64} maxWidth={width - 56} rgb="29,33,32" warm enter />
            <Animated.Text entering={FadeInDown.delay(260).duration(520).easing(ease.smoothOut)} style={s.sub}>
              Опишите книгу словами или голосом — соберём её из ваших фото.
            </Animated.Text>
          </Animated.View>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} onConfirm={(sp) => confirm(t.id, sp)} onShow={show} />)
        )}
      </ScrollView>

      <ConsentSheet
        visible={!!ask}
        onClose={() => setAsk(null)}
        onAccept={() => {
          setAiConsent(true);
          const params = ask!;
          setAsk(null);
          router.push({ pathname: '/build', params });
        }}
      />

      <Composer
        ref={composer}
        placeholder={empty ? 'Какую книгу соберём?' : 'Уточните: «32 страницы», «меньше селфи»'}
        hints={empty ? EXAMPLES : undefined}
        heard={HEARD}
        busy={busy}
        processing={busy && !(last && last.step >= 3 && !last.spec)}
        startListening={Boolean(voice)}
        autoFocus
        onSend={send}
        onPlus={() => router.push('/select')}
        plusLabel="Выбрать фото"
      />
    </View>
    </View>
  );
}

/** ИИ уточняет параметры книги: формат, ламинация, развороты. По умолчанию — то, что понял из фразы. */
function Ask({ initial, onDone }: { initial: Spec; onDone: (sp: Spec) => void }) {
  const [sp, setSp] = useState(initial);
  const pick = <K extends keyof Spec>(k: K, v: Spec[K]) => {
    Haptics.selectionAsync().catch(() => {});
    setSp((x) => ({ ...x, [k]: v }));
  };
  return (
    <Animated.View entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.answer}>
      <Text style={s.askTitle}>Пара вопросов перед сборкой</Text>
      <AskRow label="Формат" items={FORMATS} value={sp.format} show={(v) => v} onPick={(v) => pick('format', v)} />
      <AskRow label="Ламинация" items={LAMS} value={sp.lam} show={(v) => v} onPick={(v) => pick('lam', v)} />
      <AskRow label="Разворотов" items={SPREADS} value={sp.spreads} show={(v) => `${v}`} hint={`${sp.spreads * 2} стр.`} onPick={(v) => pick('spreads', v)} />
      <Tap style={[s.cta, { justifyContent: 'center', marginTop: 4 }]} onPress={() => onDone(sp)} accessibilityRole="button">
        <Text style={s.ctaText}>Собрать вариант</Text>
      </Tap>
    </Animated.View>
  );
}
function AskRow<T extends string | number>({ label, items, value, show, hint, onPick }: { label: string; items: T[]; value: T; show: (v: T) => string; hint?: string; onPick: (v: T) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={s.askHead}>
        <Text style={s.askLabel}>{label}</Text>
        {hint ? <Text style={s.askHint}>{hint}</Text> : null}
      </View>
      <View style={s.askRow} accessibilityRole="radiogroup">
        {items.map((it) => {
          const on = it === value;
          return (
            <Tap key={String(it)} style={[s.askChip, on && s.askChipOn]} onPress={() => onPick(it)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
              <Text style={[s.askChipText, on && { color: '#fff' }]}>{show(it)}</Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

/** Один запрос: крупный заголовок → шаги ИИ → плитка ответа. */
function TurnView({ turn, onConfirm, onShow }: { turn: Turn; onConfirm: (sp: Spec) => void; onShow: (params: Record<string, string>) => void }) {
  const p = turn.parsed;
  const sp = turn.spec;
  const steps: { label: string; now: string; done: string }[] = [
    { label: 'Фото', now: 'ищу по описанию', done: `${p.photos} · «${p.album}»` },
    { label: 'Отбор', now: 'убираю дубли и смазанные', done: 'лучшие кадры' },
    { label: 'Шаблон', now: 'подбираю', done: p.themeLabel === 'Своя тема' ? 'Классика' : p.themeLabel },
  ];
  const price = sp ? bookPrice('lite', fitFormat('lite', sp.format), sp.spreads, sp.lam === 'зернистая' ? 'Зерно' : 'Глянец') : tariffs[0].price;
  return (
    <View style={s.turn}>
      <Animated.Text entering={FadeInDown.duration(duration.fast).easing(ease.smoothOut)} style={s.q}>
        {turn.q}
      </Animated.Text>

      <View style={s.steps}>
        {steps.map((st, i) =>
          i <= turn.step ? (
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

      {turn.step >= 3 && !sp ? <Ask initial={{ format: '20×20', lam: 'глянцевая', spreads: nearest(p.pages / 2) }} onDone={onConfirm} /> : null}

      {turn.step >= 3 && sp ? (
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

              <Tap style={s.cta} onPress={() => onShow({ title: p.album, pages: String(sp.spreads * 2), photos: String(p.photos), format: sp.format, lam: sp.lam })} accessibilityRole="button" accessibilityLabel={`Показать вариант, от ${rub(price)}`}>
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


  turn: { gap: 14 },
  q: { fontSize: 23, lineHeight: 29, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  steps: { gap: 6 },
  step: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.card, borderRadius: 18, height: 50, paddingHorizontal: 16 },
  stepLabel: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  stepText: { flexShrink: 1, fontSize: 15, fontFamily: fonts.bold, color: colors.fg, textAlign: 'right' },
  stepNow: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut, textAlign: 'right' },

  answer: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 8 },
  askTitle: { fontSize: 19, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginBottom: 2 },
  askHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  askLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  askHint: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  askRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  askChip: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: '#fff', justifyContent: 'center' },
  askChipOn: { backgroundColor: colors.coralAction },
  askChipText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  answerTitle: { fontSize: 13, fontFamily: fonts.bold, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.peachInk },
  answerText: { fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.fg, minHeight: 23 },
  found: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  foundImg: { width: 42, height: 42, borderRadius: 12, borderWidth: 2, borderColor: colors.card },
  foundMore: { marginLeft: 10, fontSize: 14, fontFamily: fonts.semibold, color: colors.mut },
  cta: { height: 58, borderRadius: 29, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 8 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  ctaSum: { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  ctaPrice: { fontSize: 16, fontFamily: fonts.display, letterSpacing: -0.3, color: '#fff' },

});
