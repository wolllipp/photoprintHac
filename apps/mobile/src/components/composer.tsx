/**
 * Поле ввода помощника picPac — одно на все диалоги («Собрать книгу», «Помощь»):
 * подсказки-пилюли над полем, «+», микрофон, коралловая кнопка отправки; диктовка со свечением снизу;
 * поле едет за клавиатурой кадр за кадром. Помощник один — и выглядит везде одинаково.
 */
import * as Haptics from 'expo-haptics';
import { ArrowUpIcon, CheckIcon, MicrophoneIcon, PlusIcon, WaveformIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef, type Ref } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { VoiceGlow } from '@/components/voiceGlow';
import { features } from '@/data/features';
import { duration } from '@/motion';
import { colors, fonts } from '@/theme';

export type ComposerHandle = { blur: () => void; focus: () => void };
export type Hint = { label: string; text: string };

export function Composer({
  ref,
  placeholder,
  hints,
  heard: demoHeard,
  busy,
  processing,
  startListening,
  autoFocus,
  onSend,
  onPlus,
  plusLabel = 'Добавить фото',
}: {
  ref?: Ref<ComposerHandle>;
  placeholder: string;
  hints?: Hint[];
  /** что «услышит» диктовка в демо */
  heard: string;
  busy?: boolean;
  /** ИИ думает — свет внизу ходит лучом */
  processing?: boolean;
  startListening?: boolean;
  autoFocus?: boolean;
  onSend: (text: string) => void;
  onPlus?: () => void;
  plusLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  // голос — только когда есть распознавание речи (features.voice); иначе сразу поле для текста
  const [listening, setListening] = useState(Boolean(startListening) && features.voice);
  const [heard, setHeard] = useState('');
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => ({ blur: () => input.current?.blur(), focus: () => input.current?.focus() }));

  // поле едет за клавиатурой кадр за кадром, в её же темпе
  const keyboard = useAnimatedKeyboard();
  const bottomInset = insets.bottom;
  const lift = useAnimatedStyle(() => ({ paddingBottom: Math.max(keyboard.height.value, bottomInset) + 8 }));

  useEffect(() => {
    // клавиатура поднимается вместе с окном — одно движение снизу
    const t = autoFocus && !(startListening && features.voice) ? setTimeout(() => input.current?.focus(), 60) : undefined;
    return () => {
      if (t) clearTimeout(t);
    };
  }, [autoFocus, startListening]);

  // диктовка: слова появляются по ходу речи, свет внизу поднимается с каждым словом
  const level = useSharedValue(0);
  useEffect(() => {
    if (!listening) {
      level.value = withTiming(0, { duration: 300 });
      return;
    }
    const words = demoHeard.split(' ');
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
  }, [listening, level, demoHeard]);

  const send = (v: string) => {
    if (!v.trim() || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onSend(v.trim());
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

  return (
    <>
      {/* свет снизу: поднимается с голосом, пока ИИ думает — ходит лучом */}
      <VoiceGlow active={listening} processing={!!processing && !listening} level={level} />

      <Animated.View style={[s.wrap, lift]}>
        {hints?.length && !listening ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.hintsRow} contentContainerStyle={s.hints}>
            {hints.map((e) => (
              <Tap key={e.label} style={s.hint} onPress={() => send(e.text)} accessibilityRole="button" accessibilityLabel={`Пример: ${e.text}`}>
                <Text style={s.hintText}>{e.label}</Text>
              </Tap>
            ))}
          </ScrollView>
        ) : null}
        <View style={[s.box, listening && s.boxVoice]}>
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
                placeholder={placeholder}
                placeholderTextColor={colors.mut2}
                style={s.input}
                accessibilityLabel={placeholder}
              />
              <View style={s.bar}>
                {onPlus ? (
                  <Tap style={s.ghost} onPress={onPlus} accessibilityRole="button" accessibilityLabel={plusLabel}>
                    <PlusIcon size={18} color={colors.fg} weight="bold" />
                  </Tap>
                ) : null}
                <View style={{ flex: 1 }} />
                {features.voice ? (
                  <Tap style={s.ghostFlat} onPress={startVoice} accessibilityRole="button" accessibilityLabel="Надиктовать">
                    <MicrophoneIcon size={20} color={colors.fg} />
                  </Tap>
                ) : null}
                {text.trim() || !features.voice ? (
                  <Tap style={[s.send, (busy || !text.trim()) && { opacity: 0.35 }]} onPress={() => send(text)} disabled={busy || !text.trim()} accessibilityRole="button" accessibilityLabel="Отправить">
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
      </Animated.View>
    </>
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
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  hintsRow: { marginHorizontal: -12, flexGrow: 0, marginBottom: 8 },
  hints: { paddingHorizontal: 12, gap: 6 },
  hint: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' },
  hintText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  box: { backgroundColor: colors.card, borderRadius: 26, padding: 12, paddingBottom: 10 },
  boxVoice: { backgroundColor: 'transparent', paddingTop: 24 },
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
