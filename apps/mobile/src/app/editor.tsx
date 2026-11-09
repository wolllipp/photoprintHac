/**
 * Конструктор книги — то же, что редактор picPac (развороты с рамками, фон, раскладка, текст,
 * отменить/повторить, «Заказать»), но книга приходит уже собранной ИИ, а не пустым шаблоном:
 * правишь то, что не нравится. Рамку выбираешь касанием — фото из ленты снизу встаёт в неё.
 * «Автозаполнить» раскладывает неиспользованные фото по пустым рамкам. Слабые по разрешению
 * кадры помечаются сразу, до заказа.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  CaretLeftIcon,
  CheckIcon,
  PlusIcon,
  SparkleIcon,
  SquaresFourIcon,
  TextTIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { drafts, spreads as aiSpreads, type PageLayout, type Spread } from '@/data/demo';
import { type PhotoName, photos, pic } from '@/data/photos';
import { useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

const BGS = ['#FFFDF9', '#F1E7DA', '#1D2120'];
/** Раскладки разворота по кругу: кнопка «раскладка» переключает на следующую. */
const COMBOS: [PageLayout, PageLayout][] = [['three', 'two'], ['two', 'two'], ['one', 'two'], ['two', 'one'], ['one', 'one'], ['two', 'three']];
const count = (l: PageLayout) => (l === 'one' ? 1 : l === 'two' ? 2 : 3);
const LIBRARY = Object.keys(photos) as PhotoName[];
// shortcut: «слабым» помечен один кадр вручную; в продукте — проверка разрешения против формата (A8)
const LOW_RES = new Set<PhotoName>(['concert']);

type Sel = { s: number; f: number } | null;

export default function Editor() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { design, setDesign } = useStore();
  const [book, setBook] = useState<Spread[]>(() => (design ?? aiSpreads).map((sp) => ({ bg: BGS[0], caption: null, ...sp })));
  const [past, setPast] = useState<Spread[][]>([]);
  const [future, setFuture] = useState<Spread[][]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const W = width - 32;

  const commit = (next: Spread[]) => {
    setPast((p) => [...p, book]);
    setFuture([]);
    setBook(next);
  };
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setFuture((f) => [book, ...f]);
    setPast((p) => p.slice(0, -1));
    setBook(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((p) => [...p, book]);
    setFuture((f) => f.slice(1));
    setBook(next);
  };
  const patch = (i: number, sp: Partial<Spread>) => commit(book.map((x, j) => (j === i ? { ...x, ...sp } : x)));

  const used = new Set(book.flatMap((sp) => sp.photos).filter(Boolean));
  const empty = book.reduce((n, sp) => n + sp.photos.filter((p) => !p).length, 0);

  // фото из ленты: в выбранную рамку, иначе — в первую пустую
  const place = (k: PhotoName) => {
    let target = sel;
    if (!target) {
      const s = book.findIndex((sp) => sp.photos.some((p) => !p));
      if (s < 0) return;
      target = { s, f: book[s].photos.findIndex((p) => !p) };
    }
    Haptics.selectionAsync().catch(() => {});
    const t = target;
    commit(book.map((sp, j) => (j === t.s ? { ...sp, photos: sp.photos.map((p, f) => (f === t.f ? k : p)) } : sp)));
    setSel(null);
  };
  const remove = (t: { s: number; f: number }) => {
    commit(book.map((sp, j) => (j === t.s ? { ...sp, photos: sp.photos.map((p, f) => (f === t.f ? null : p)) } : sp)));
    setSel(null);
  };
  const cycleLayout = (i: number) => {
    const sp = book[i];
    const at = COMBOS.findIndex(([l, r]) => l === sp.left && r === sp.right);
    const [left, right] = COMBOS[(at + 1) % COMBOS.length];
    const n = count(left) + count(right);
    // фото сохраняем по порядку: лишние уходят обратно в ленту, новые рамки пустые
    patch(i, { left, right, photos: Array.from({ length: n }, (_, f) => sp.photos[f] ?? null) });
    setSel(null);
  };
  const autofill = () => {
    const free = LIBRARY.filter((k) => !used.has(k) && !LOW_RES.has(k));
    let n = 0;
    commit(book.map((sp) => ({ ...sp, photos: sp.photos.map((p) => p ?? free[n++ % Math.max(1, free.length)] ?? null) })));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  const addSpread = () => commit([...book, { left: 'two', right: 'two', photos: [null, null, null, null], bg: BGS[0], caption: null }]);
  const order = () => {
    setDesign(book);
    router.back();
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* верх: назад · отменить · повторить · заказать */}
      <View style={s.top}>
        <Tap style={s.round} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
          <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
        <Tap style={s.round} onPress={undo} disabled={!past.length} accessibilityRole="button" accessibilityLabel="Отменить">
          <ArrowArcLeftIcon size={18} color={past.length ? colors.fg : colors.mut2} weight="bold" />
        </Tap>
        <Tap style={s.round} onPress={redo} disabled={!future.length} accessibilityRole="button" accessibilityLabel="Повторить">
          <ArrowArcRightIcon size={18} color={future.length ? colors.fg : colors.mut2} weight="bold" />
        </Tap>
        <Text style={s.topTitle} numberOfLines={1}>{drafts[id ?? '']?.title ?? 'Моя книга'}</Text>
        <Tap style={s.done} onPress={order} accessibilityRole="button">
          <CheckIcon size={16} color="#fff" weight="bold" />
          <Text style={s.doneText}>Готово</Text>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 200 + insets.bottom }]} onScrollBeginDrag={() => setSel(null)}>
        {book.map((sp, i) => (
          <Animated.View key={i} layout={LinearTransition.reduceMotion(ReduceMotion.System)} style={{ gap: 8 }}>
            <View style={s.spHead}>
              <Text style={s.spTitle}>Разворот {i + 1}</Text>
              <Tool label="Фон" onPress={() => patch(i, { bg: BGS[(BGS.indexOf(sp.bg ?? BGS[0]) + 1) % BGS.length] })}>
                <View style={[s.swatch, { backgroundColor: sp.bg }]} />
              </Tool>
              <Tool label="Раскладка" onPress={() => cycleLayout(i)}>
                <SquaresFourIcon size={18} color={colors.fg} weight="bold" />
              </Tool>
              <Tool label="Текст" on={sp.caption !== null} onPress={() => patch(i, { caption: sp.caption === null ? '' : null })}>
                <TextTIcon size={18} color={sp.caption !== null ? '#fff' : colors.fg} weight="bold" />
              </Tool>
              {book.length > 1 ? (
                <Tool label="Удалить разворот" onPress={() => commit(book.filter((_, j) => j !== i))}>
                  <TrashIcon size={18} color={colors.fg} weight="bold" />
                </Tool>
              ) : null}
            </View>

            <View style={[s.spread, { width: W, height: Math.round(W / 1.9), backgroundColor: sp.bg }]}>
              {(['left', 'right'] as const).map((side) => {
                const layout = side === 'left' ? sp.left : sp.right;
                const off = side === 'left' ? 0 : count(sp.left);
                const frames = Array.from({ length: count(layout) }, (_, k) => off + k);
                const frame = (f: number, flex = 1) => (
                  <Frame
                    key={f}
                    k={sp.photos[f] ?? null}
                    flex={flex}
                    selected={sel?.s === i && sel.f === f}
                    onPress={() => setSel(sel?.s === i && sel.f === f ? null : { s: i, f })}
                    onRemove={() => remove({ s: i, f })}
                  />
                );
                return (
                  <View key={side} style={s.page}>
                    {layout === 'one' ? frame(frames[0]) : null}
                    {layout === 'two' ? (
                      <>
                        {frame(frames[0], 1.2)}
                        {frame(frames[1])}
                      </>
                    ) : null}
                    {layout === 'three' ? (
                      <>
                        {frame(frames[0], 1.4)}
                        <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
                          {frame(frames[1])}
                          {frame(frames[2])}
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </View>
            {sp.caption !== null ? (
              <TextInput
                value={sp.caption}
                onChangeText={(t) => setBook((b) => b.map((x, j) => (j === i ? { ...x, caption: t } : x)))}
                placeholder="Подпись к развороту"
                placeholderTextColor={colors.mut2}
                style={s.caption}
                accessibilityLabel={`Подпись к развороту ${i + 1}`}
              />
            ) : null}
          </Animated.View>
        ))}

        <Tap style={s.addSpread} onPress={addSpread} accessibilityRole="button">
          <PlusIcon size={18} color={colors.fg} weight="bold" />
          <Text style={s.addText}>Добавить разворот</Text>
        </Tap>
      </ScrollView>

      {/* лента фото + автозаполнение */}
      <View style={[s.tray, { paddingBottom: insets.bottom + 10 }]}>
        <View style={s.trayHead}>
          <Text style={s.trayHint} numberOfLines={1}>
            {sel ? 'Выберите фото для рамки' : empty ? `Пустых рамок: ${empty}` : 'Все рамки заполнены'}
          </Text>
          {empty ? (
            <Tap style={s.auto} onPress={autofill} accessibilityRole="button">
              <SparkleIcon size={15} color="#fff" weight="fill" />
              <Text style={s.autoText}>Автозаполнить</Text>
            </Tap>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {LIBRARY.map((k) => (
            <Tap key={k} onPress={() => place(k)} accessibilityRole="button" accessibilityLabel={`Фото ${k}${used.has(k) ? ', уже в книге' : ''}`}>
              <Image source={pic(k)} style={[s.thumb, used.has(k) && { opacity: 0.45 }]} contentFit="cover" />
              {used.has(k) ? <View style={s.usedDot}><CheckIcon size={9} color="#fff" weight="bold" /></View> : null}
              {LOW_RES.has(k) ? <View style={s.lowDot}><WarningIcon size={10} color="#fff" weight="fill" /></View> : null}
            </Tap>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function Tool({ label, on, onPress, children }: { label: string; on?: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Tap style={[s.tool, on && { backgroundColor: colors.fg }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      {children}
    </Tap>
  );
}

function Frame({ k, flex, selected, onPress, onRemove }: { k: PhotoName | null; flex: number; selected: boolean; onPress: () => void; onRemove: () => void }) {
  return (
    <Tap style={[s.frame, { flex }, selected && s.frameOn]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={k ? 'Рамка с фото' : 'Пустая рамка'}>
      {k ? (
        <Animated.View key={k} entering={ZoomIn.springify().damping(16).reduceMotion(ReduceMotion.System)} style={StyleSheet.absoluteFill}>
          <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
        </Animated.View>
      ) : (
        <PlusIcon size={16} color={colors.mut2} weight="bold" />
      )}
      {k && LOW_RES.has(k) ? (
        <View style={s.warn} accessibilityLabel="Мало пикселей для этого размера">
          <WarningIcon size={11} color="#fff" weight="fill" />
          <Text style={s.warnText}>мало пикселей</Text>
        </View>
      ) : null}
      {selected && k ? (
        <Tap style={s.x} onPress={onRemove} accessibilityRole="button" accessibilityLabel="Убрать фото" hitSlop={6}>
          <XIcon size={11} color="#fff" weight="bold" />
        </Tap>
      ) : null}
    </Tap>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  done: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.fg, flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  content: { paddingHorizontal: 16, gap: 22, paddingTop: 6 },
  spHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  spTitle: { flex: 1, fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  tool: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.mut2 },
  spread: { flexDirection: 'row', borderRadius: 6, padding: 6, gap: 10, boxShadow: '0 8px 22px -12px rgba(60,40,30,0.35), 0 0 0 1px rgba(60,40,30,0.06)' },
  page: { flex: 1, gap: 5 },
  frame: { borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(130,120,110,0.14)', alignItems: 'center', justifyContent: 'center' },
  frameOn: { borderWidth: 2.5, borderColor: colors.coralAction },
  warn: { position: 'absolute', left: 4, bottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warn, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  warnText: { fontSize: 9, fontFamily: fonts.semibold, color: '#fff' },
  x: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 15, fontFamily: fonts.medium, color: colors.fg, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  addSpread: { height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.mut2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  tray: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingTop: 10, gap: 8, boxShadow: '0 -8px 24px -16px rgba(60,40,30,0.3)' },
  trayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 34 },
  trayHint: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.mut },
  auto: { height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: colors.coralAction, flexDirection: 'row', alignItems: 'center', gap: 6 },
  autoText: { fontSize: 14, fontFamily: fonts.semibold, color: '#fff' },
  strip: { paddingHorizontal: 16, gap: 6 },
  thumb: { width: 68, height: 68, borderRadius: 12 },
  usedDot: { position: 'absolute', right: 4, bottom: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center' },
  lowDot: { position: 'absolute', left: 4, top: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.warn, alignItems: 'center', justifyContent: 'center' },
});
