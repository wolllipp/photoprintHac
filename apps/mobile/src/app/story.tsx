/**
 * Путь Б, шаг 1 — «Опишите книгу»: текст или голос → карточка «Поняли так» с «Изменить / Собрать».
 * ИИ ничего не решает молча: пользователь видит разбор и подтверждает его.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { BookOpenTextIcon, ImagesIcon, MicrophoneIcon, SparkleIcon } from 'phosphor-react-native';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseStory } from '@/ai/story';
import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

const CHIPS = ['Путешествие', 'Ребёнок', 'Свадьба', 'Выпускной', 'Новый год'];
const DEMO = 'Книга про поездку в Карелию, тёплая, на 24 страницы, больше пейзажей';

export default function Story() {
  const insets = useSafeAreaInsets();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const [text, setText] = useState(DEMO);
  const [chip, setChip] = useState('Путешествие');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const parsed = useMemo(() => parseStory(text), [text]);

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="Новая книга" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.chips}>
          {CHIPS.map((c) => (
            <Tap key={c} style={[s.chip, c === chip && s.chipOn]} onPress={() => setChip(c)} accessibilityRole="button" accessibilityState={{ selected: c === chip }}>
              <Text style={[s.chipText, c === chip && s.chipTextOn]}>{c}</Text>
            </Tap>
          ))}
        </ScrollView>

        <View style={s.inputCard}>
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Например: книга про первый год сына, светлая, 30 страниц"
            placeholderTextColor={colors.mut}
            style={s.input}
            accessibilityLabel="Описание книги"
          />
          <View style={s.inputFoot}>
            <Text style={s.hint}>{voice ? 'Слушаю… говорите' : 'или скажите голосом'}</Text>
            <Tap style={[s.mic, voice ? s.micOn : null]} accessibilityRole="button" accessibilityLabel="Сказать голосом">
              <MicrophoneIcon size={18} color={voice ? '#fff' : colors.coralAction} weight="fill" />
            </Tap>
          </View>
        </View>

        {parsed ? (
          <View style={s.parse} accessibilityLabel="Поняли так">
            <Text style={s.lbl}>Поняли так</Text>
            <Row icon={<ImagesIcon size={18} color={colors.coralLink} weight="fill" />} tint={colors.coralTint} title="Фото" sub={`альбом «${parsed.album}»`} value={String(parsed.photos)} />
            <Row icon={<BookOpenTextIcon size={18} color={colors.tealInk} weight="fill" />} tint={colors.tealTint} title="Объём" sub="Classic 20×20 — подходит под кадры" value={`${parsed.pages} стр.`} />
            <Row
              icon={<SparkleIcon size={18} color={colors.warn} weight="fill" />}
              tint={colors.warnTint}
              title="Тон и акцент"
              sub={[parsed.tone ?? 'спокойный', parsed.accent ?? 'лучшие кадры'].join(' · ')}
            />
            <View style={s.btns}>
              <Tap style={[s.btn, s.btnPlain]} onPress={() => input.current?.focus()} accessibilityRole="button">
                <Text style={s.btnPlainText}>Изменить</Text>
              </Tap>
              <Tap style={[s.btn, s.btnPrimary]} onPress={() => router.push('/build')} accessibilityRole="button">
                <Text style={s.btnPrimaryText}>Собрать</Text>
              </Tap>
            </View>
          </View>
        ) : (
          <Text style={s.empty}>Опишите тему, настроение и объём — мы подберём фото и шаблон.</Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ icon, tint, title, sub, value }: { icon: React.ReactNode; tint: string; title: string; sub: string; value?: string }) {
  return (
    <View style={s.prow}>
      <View style={[s.pico, { backgroundColor: tint }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.ptitle}>{title}</Text>
        <Text style={s.psub}>{sub}</Text>
      </View>
      {value ? <Text style={s.pval}>{value}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, gap: 16 },
  bleed: { marginHorizontal: -18, flexGrow: 0 },
  chips: { paddingHorizontal: 18, gap: 8 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.card, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink2 },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  chipTextOn: { color: '#fff' },
  inputCard: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 10 },
  input: { fontSize: 19, lineHeight: 26, fontFamily: fonts.medium, color: colors.fg, minHeight: 80, textAlignVertical: 'top' },
  inputFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.coralTint, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.coralAction },
  parse: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 10 },
  lbl: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, paddingLeft: 4 },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  pico: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ptitle: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  psub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  pval: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg, fontVariant: ['tabular-nums'] },
  btns: { flexDirection: 'row', gap: 10, paddingTop: 2 },
  btn: { flex: 1, height: 48, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  btnPlain: { backgroundColor: colors.card2 },
  btnPlainText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  btnPrimary: { backgroundColor: colors.coralAction },
  btnPrimaryText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
  empty: { fontSize: 15, fontFamily: fonts.regular, lineHeight: 21, color: colors.mut, paddingHorizontal: 4 },
});
