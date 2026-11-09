/**
 * Ассистент picPac (экран 9): честно назван ассистентом, решения по правилам гарантии,
 * человек — в одно касание. Претензия по браку: фото дефекта → проверка → перепечатка без пересылки.
 */
import { CameraIcon, PaperPlaneRightIcon } from 'phosphor-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkDefect, quickAnswer, type ClaimVerdict } from '@/ai/assistant';
import { NavBar } from '@/components/nav';
import { Photo, Tap } from '@/components/ui';
import { enterItem, SuccessCheck, ThinkingLine } from '@/motion';
import { colors } from '@/theme';

type Msg =
  | { id: number; from: 'me'; text: string }
  | { id: number; from: 'me'; photo: true }
  | { id: number; from: 'bot'; text: string }
  | { id: number; from: 'bot'; thinking: string }
  | { id: number; from: 'bot'; reprint: ClaimVerdict; confirmed?: boolean };

let nextId = 1;

export default function Assistant() {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: nextId++, from: 'bot', text: 'Здравствуйте! Я ассистент picPac. Помогу со статусом заказа, сроками и браком. Если что-то пошло не так — пришлите фото.' },
  ]);

  const push = (m: Msg) => setMsgs((x) => [...x, m]);
  const replaceThinking = (m: Msg) => setMsgs((x) => [...x.filter((y) => !('thinking' in y)), m]);

  const sendDefect = async () => {
    push({ id: nextId++, from: 'me', text: 'На одной странице полоса через всю фотографию' });
    push({ id: nextId++, from: 'me', photo: true });
    push({ id: nextId++, from: 'bot', thinking: 'Смотрю фото дефекта…' });
    const v = await checkDefect();
    replaceThinking({ id: nextId++, from: 'bot', text: `Похоже на производственный брак: ${v.label}. Перепечатаем книгу бесплатно — старую возвращать не нужно.` });
    push({ id: nextId++, from: 'bot', reprint: v });
  };

  const ask = (q: string) => {
    if (!q.trim()) return;
    push({ id: nextId++, from: 'me', text: q.trim() });
    setText('');
    setTimeout(() => push({ id: nextId++, from: 'bot', text: quickAnswer(q) }), 600);
  };

  const confirm = (id: number) => setMsgs((x) => x.map((m) => (m.id === id && 'reprint' in m ? { ...m, confirmed: true } : m)));

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="Ассистент picPac" />
      <Text style={s.status}>● решения по правилам гарантии</Text>

      <ScrollView ref={scroll} contentContainerStyle={s.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {msgs.map((m) => (
          <Animated.View key={m.id} entering={enterItem()} style={m.from === 'me' ? s.right : s.left}>
            {'photo' in m ? (
              <View style={s.photo}>
                <Photo k="g3" style={StyleSheet.absoluteFill} />
                <View style={s.stripe} />
              </View>
            ) : 'thinking' in m ? (
              <View style={[s.bubble, s.bot]}><ThinkingLine text={m.thinking} /></View>
            ) : 'reprint' in m ? (
              <View style={s.card}>
                <View style={s.cardHead}>
                  <Text style={s.cardTitle}>Перепечать заказа №4792100</Text>
                  <Text style={s.free}>бесплатно</Text>
                </View>
                <View style={s.kv}><Text style={s.k}>Доставка</Text><Text style={s.v}>тем же способом</Text></View>
                <View style={s.kv}><Text style={s.k}>Будет у вас</Text><Text style={s.v}>{m.reprint.eta}</Text></View>
                {m.confirmed ? (
                  <Animated.View entering={FadeIn} style={s.done}>
                    <SuccessCheck size={40} />
                    <Text style={s.doneText}>Перепечать оформлена. Пришлю уведомление, когда книга уйдёт в печать.</Text>
                  </Animated.View>
                ) : (
                  <Tap style={s.cta} onPress={() => confirm(m.id)} accessibilityRole="button">
                    <Text style={s.ctaText}>Подтвердить</Text>
                  </Tap>
                )}
              </View>
            ) : (
              <View style={[s.bubble, m.from === 'me' ? s.me : s.bot]}>
                <Text style={[s.text, m.from === 'me' && { color: '#fff' }]}>{m.text}</Text>
              </View>
            )}
          </Animated.View>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
        <Tap style={s.chip} onPress={sendDefect} accessibilityRole="button"><Text style={s.chipText}>Пришёл брак</Text></Tap>
        <Tap style={s.chip} onPress={() => ask('Когда приедет новая?')} accessibilityRole="button"><Text style={s.chipText}>Когда приедет новая?</Text></Tap>
        <Tap style={s.chip} onPress={() => ask('Позвать человека')} accessibilityRole="button"><Text style={s.chipText}>Позвать человека</Text></Tap>
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: insets.bottom + 10 }]}>
        <Tap style={s.round} onPress={sendDefect} accessibilityRole="button" accessibilityLabel="Прислать фото">
          <CameraIcon size={20} color={colors.fg} />
        </Tap>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => ask(text)}
          placeholder="Сообщение"
          placeholderTextColor={colors.mut}
          style={s.input}
          returnKeyType="send"
          accessibilityLabel="Сообщение ассистенту"
        />
        <Tap style={[s.round, s.send]} onPress={() => ask(text)} accessibilityRole="button" accessibilityLabel="Отправить">
          <PaperPlaneRightIcon size={18} color="#fff" weight="fill" />
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  status: { textAlign: 'center', fontSize: 12, color: colors.tealInk, marginTop: -6, marginBottom: 6 },
  list: { paddingHorizontal: 18, gap: 10, paddingBottom: 12 },
  left: { alignSelf: 'flex-start', maxWidth: '86%' },
  right: { alignSelf: 'flex-end', maxWidth: '80%' },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20 },
  me: { backgroundColor: colors.coralAction, borderBottomRightRadius: 6 },
  bot: { backgroundColor: colors.card, borderBottomLeftRadius: 6 },
  text: { fontSize: 15.5, lineHeight: 21, color: colors.fg },
  photo: { width: 150, height: 110, borderRadius: 16, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, right: 0, top: '46%', height: 6, backgroundColor: 'rgba(255,255,255,0.75)' },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 14, gap: 8, width: 300 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.fg },
  free: { fontSize: 12, fontWeight: '600', color: colors.tealInk, backgroundColor: colors.tealTint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  kv: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { fontSize: 14, color: colors.mut },
  v: { fontSize: 14, fontWeight: '600', color: colors.fg },
  cta: { height: 46, borderRadius: 13, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  doneText: { flex: 1, fontSize: 14, lineHeight: 19, color: colors.fg },
  chips: { paddingHorizontal: 18, gap: 8, paddingVertical: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.card, justifyContent: 'center' },
  chipText: { fontSize: 14, fontWeight: '500', color: colors.fg },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  send: { backgroundColor: colors.coralAction },
  input: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.card, paddingHorizontal: 16, fontSize: 15.5, color: colors.fg },
});
