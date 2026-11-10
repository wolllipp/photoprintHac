/**
 * Правка книги словами после сборки (A2): «убери людей с 3 разворота», «больше пейзажей».
 * Помощник отвечает теми же строками «подпись — итог», что в диалоге, и меняет развороты на месте.
 * В демо — правила по словам запроса; в продукте — локальная модель с доступом к макету книги.
 */
import * as Haptics from 'expo-haptics';
import { ArrowUpIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import type { Spread } from '@/data/demo';
import type { PhotoName } from '@/data/photos';
import { ease, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const PEOPLE: PhotoName[] = ['friends-selfie', 'friends-night', 'birthday-cake'];
const VIEWS: PhotoName[] = ['city-sunset', 'night-window', 'roses', 'bouquet', 'cafe-interior', 'cafe-dessert', 'concert'];
const HINTS = ['Меньше селфи', 'Больше пейзажей', 'Убери людей с 3 разворота'];

type Edit = { id: number; q: string; found: string; done: string; ready: boolean };

/** Что сделать с книгой по фразе: какие развороты затронуть и чем заменить. */
function apply(book: Spread[], q: string): { next: Spread[]; changed: number[]; found: string; done: string } {
  const m = q.match(/(\d+)\s*-?\s*(?:м|й|ом|ого)?\s*развор/i) ?? q.match(/развор\w*\s*(\d+)/i);
  const only = m ? Math.max(1, Math.min(book.length, Number(m[1]))) - 1 : null;
  const people = /люд|селфи|лиц/i.test(q);
  const views = /пейзаж|вид|природ/i.test(q);
  let k = 0;
  const changed: number[] = [];
  let swaps = 0;
  const next = book.map((sp, i) => {
    if (only !== null && i !== only) return sp;
    const photos = [...sp.photos];
    photos.forEach((ph, j) => {
      const swap = people || views ? ph && PEOPLE.includes(ph as PhotoName) : false;
      if (!swap) return;
      // берём пейзаж, которого на этом развороте ещё нет
      for (let t = 0; t < VIEWS.length; t++) {
        const cand = VIEWS[(k + t) % VIEWS.length];
        if (!photos.includes(cand)) {
          photos[j] = cand;
          k += t + 1;
          swaps++;
          return;
        }
      }
    });
    if (photos.some((ph, j) => ph !== sp.photos[j])) changed.push(i);
    return { ...sp, photos };
  });
  const where = only !== null ? `разворот ${only + 1}` : `${changed.length} ${changed.length === 1 ? 'разворот' : 'разворота'}`;
  if (!swaps) return { next: book, changed: [], found: only !== null ? `разворот ${only + 1}` : 'вся книга', done: 'менять нечего — уже так' };
  return { next, changed, found: `${swaps} ${swaps === 1 ? 'кадр' : swaps < 5 ? 'кадра' : 'кадров'} с людьми · ${where}`, done: 'заменили на пейзажи' };
}

export function RefineCard({ book, onChange }: { book: Spread[]; onChange: (next: Spread[], changed: number[]) => void }) {
  const [text, setText] = useState('');
  const [edits, setEdits] = useState<Edit[]>([]);
  const busy = edits.some((e) => !e.ready);

  const send = (q: string) => {
    const v = q.trim();
    if (!v || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const r = apply(book, v);
    const id = edits.length + 1;
    setEdits((x) => [...x, { id, q: v, found: r.found, done: r.done, ready: false }]);
    setText('');
    setTimeout(() => {
      setEdits((x) => x.map((e) => (e.id === id ? { ...e, ready: true } : e)));
      onChange(r.next, r.changed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 1100);
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>Поправить словами</Text>
      <Text style={s.sub}>Скажите, что изменить, — пересоберём только нужные развороты.</Text>

      {edits.map((e) => (
        <Animated.View key={e.id} entering={FadeInDown.duration(260).easing(ease.smoothOut)} style={{ gap: 6 }}>
          <Text style={s.q}>{e.q}</Text>
          <View style={s.step}>
            <Text style={s.stepLabel}>Нашли</Text>
            {e.ready ? <Animated.Text entering={FadeIn} style={s.stepText}>{e.found}</Animated.Text> : <ThinkingLine text="ищу…" style={s.stepNow} />}
          </View>
          {e.ready ? (
            <Animated.View entering={FadeInDown.duration(220)} style={s.step}>
              <Text style={s.stepLabel}>Сделали</Text>
              <Text style={[s.stepText, { color: colors.tealInk }]}>{e.done}</Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      ))}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.hintsRow} contentContainerStyle={s.hints}>
        {HINTS.map((h) => (
          <Tap key={h} style={s.hint} onPress={() => send(h)} accessibilityRole="button">
            <Text style={s.hintText}>{h}</Text>
          </Tap>
        ))}
      </ScrollView>
      <View style={s.field}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => send(text)}
          placeholder="Например: убери людей с 2 разворота"
          placeholderTextColor={colors.mut2}
          returnKeyType="send"
          style={s.input}
          accessibilityLabel="Что поправить в книге"
        />
        <Tap style={[s.send, (!text.trim() || busy) && { opacity: 0.35 }]} onPress={() => send(text)} disabled={!text.trim() || busy} accessibilityRole="button" accessibilityLabel="Отправить">
          <ArrowUpIcon size={18} color="#fff" weight="bold" />
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 10 },
  title: { fontSize: 17, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  sub: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, marginTop: -6 },
  q: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg, marginTop: 4 },
  step: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.bg, borderRadius: 16, height: 44, paddingHorizontal: 14 },
  stepLabel: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  stepText: { flexShrink: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.fg, textAlign: 'right' },
  stepNow: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  hintsRow: { marginHorizontal: -14, flexGrow: 0 },
  hints: { paddingHorizontal: 14, gap: 6 },
  hint: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#fff', justifyContent: 'center' },
  hintText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 24, paddingLeft: 14, paddingRight: 5, height: 48 },
  input: { flex: 1, fontSize: 15.5, fontFamily: fonts.medium, color: colors.fg, padding: 0 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
});
