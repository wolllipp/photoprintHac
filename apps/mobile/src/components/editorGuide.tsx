/**
 * Как пользоваться книгой — при первом открытии и по «?» в напоминании. Три коротких шага с живой анимацией
 * на маленькой странице: 1) нажмите на фото — палец касается, фото обводится; 2) выберите, что сделать —
 * снизу выезжает меню; 3) или оставьте замечание — встаёт точка с текстом, «Исправить» мягко пульсирует.
 * Фото без людей.
 */
import { Image } from 'expo-image';
import { ChatCircleTextIcon, HandPointingIcon, ImagesIcon, SquaresFourIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { colors, fonts } from '@/theme';

const STEPS = [
  { title: 'Нажмите на фото', text: 'Любое фото на любой странице — то, которое хотите поменять.' },
  { title: 'Выберите, что сделать', text: 'Заменить своим из галереи, убрать или выбрать другой макет страницы — в том числе с подписью.' },
  { title: 'Или попросите ИИ', text: 'Напишите или скажите, что поправить, или выберите готовое: «Свет и цвет», «Выровнять горизонт»… Потом «Исправить» — ИИ сделает всё разом.' },
];
const LOOP = { reduceMotion: ReduceMotion.System } as const;

export function EditorGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.card}>
          {/* живая подсказка: маленькая страница и то, что с ней происходит на этом шаге */}
          <View style={s.demo}>
            <MiniPage step={step} />
          </View>
          <View style={s.dots}>
            {STEPS.map((_, i) => (
              <View key={i} style={[s.dot, i === step && s.dotOn]} />
            ))}
          </View>
          <Animated.View key={step} entering={FadeIn.duration(220)} style={{ gap: 6 }}>
            <Text style={s.title}>{STEPS[step].title}</Text>
            <Text style={s.text}>{STEPS[step].text}</Text>
          </Animated.View>
          <View style={s.btns}>
            {step > 0 ? (
              <Tap style={[s.btn, s.btnGhost]} onPress={() => setStep((x) => x - 1)} accessibilityRole="button">
                <Text style={s.btnGhostText}>Назад</Text>
              </Tap>
            ) : (
              <Tap style={[s.btn, s.btnGhost]} onPress={onClose} accessibilityRole="button">
                <Text style={s.btnGhostText}>Пропустить</Text>
              </Tap>
            )}
            <Tap
              style={[s.btn, s.btnMain]}
              onPress={() => {
                if (last) {
                  setStep(0);
                  onClose();
                } else setStep((x) => x + 1);
              }}
              accessibilityRole="button">
              <Text style={s.btnMainText}>{last ? 'Понятно' : 'Дальше'}</Text>
            </Tap>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Маленькая страница книги: два фото. Палец, обводка, меню и точка — по шагам. */
function MiniPage({ step }: { step: number }) {
  return (
    <View style={s.page}>
      <View style={[s.photo, { flex: 1.2 }]}>
        <Image source={pic('city-sunset')} style={StyleSheet.absoluteFill} contentFit="cover" />
      </View>
      <View style={[s.photo, { flex: 1 }]}>
        <Image source={pic('cafe-dessert')} style={StyleSheet.absoluteFill} contentFit="cover" />
        {step >= 0 ? <Ring key={`ring-${step}`} /> : null}
      </View>
      {step === 0 ? <Finger /> : null}
      {step === 1 ? <MiniMenu /> : null}
      {step === 2 ? <MiniPin /> : null}
    </View>
  );
}

/** Обводка нажатого фото: появляется после касания пальцем, повторяется. */
function Ring() {
  const o = useSharedValue(0);
  useEffect(() => {
    o.set(withRepeat(withSequence(withDelay(700, withTiming(1, { duration: 160 })), withDelay(1300, withTiming(0, { duration: 200 }))), -1, false, undefined, LOOP.reduceMotion));
  }, [o]);
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[s.ring, a]} />;
}

/** Палец подъезжает к нижнему фото и нажимает (чуть уменьшается), по кругу. */
function Finger() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(
      withRepeat(
        withSequence(withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }), withTiming(1.15, { duration: 120 }), withTiming(1, { duration: 120 }), withDelay(1000, withTiming(0, { duration: 300 }))),
        -1,
        false,
        undefined,
        LOOP.reduceMotion,
      ),
    );
  }, [p]);
  const a = useAnimatedStyle(() => {
    const v = Math.min(p.value, 1);
    const press = p.value > 1 ? 1 - (p.value - 1) : 1;
    return { opacity: v, transform: [{ translateX: 40 - 40 * v }, { translateY: 50 - 50 * v }, { scale: press }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[s.finger, a]}>
      <HandPointingIcon size={38} color={colors.fg} weight="fill" />
    </Animated.View>
  );
}

/** Меню выезжает снизу: заменить, раскладка, замечание. */
function MiniMenu() {
  const y = useSharedValue(1);
  useEffect(() => {
    y.set(withRepeat(withSequence(withDelay(300, withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })), withDelay(1800, withTiming(1, { duration: 260 }))), -1, false, undefined, LOOP.reduceMotion));
  }, [y]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value * 90 }], opacity: 1 - y.value * 0.6 }));
  const item = (icon: React.ReactNode, label: string) => (
    <View style={s.mItem}>
      <View style={s.mIcon}>{icon}</View>
      <Text style={s.mText}>{label}</Text>
    </View>
  );
  return (
    <Animated.View pointerEvents="none" style={[s.menu, a]}>
      {item(<ImagesIcon size={14} color={colors.fg} weight="bold" />, 'Заменить')}
      {item(<SquaresFourIcon size={14} color={colors.fg} weight="bold" />, 'Макет')}
      {item(<ChatCircleTextIcon size={14} color={colors.fg} weight="bold" />, 'Замечание')}
    </Animated.View>
  );
}

/** Точка замечания с текстом и пульсирующая «Исправить». */
function MiniPin() {
  const p = useSharedValue(1);
  useEffect(() => {
    p.set(withRepeat(withSequence(withTiming(1.06, { duration: 500 }), withTiming(1, { duration: 500 })), -1, false, undefined, LOOP.reduceMotion));
  }, [p]);
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
  return (
    <>
      <Animated.View entering={FadeIn.delay(200).duration(250)} exiting={FadeOut.duration(150)} style={s.pinWrap} pointerEvents="none">
        <View style={s.pin}>
          <Text style={s.pinN}>1</Text>
        </View>
        <View style={s.note}>
          <Text style={s.noteText}>Сделай крупнее</Text>
        </View>
      </Animated.View>
      <Animated.View entering={FadeIn.delay(600).duration(250)} style={[s.fix, pulse]} pointerEvents="none">
        <Text style={s.fixText}>Исправить</Text>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,16,14,0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { alignSelf: 'stretch', backgroundColor: colors.bg, borderRadius: 28, padding: 18, gap: 14 },
  demo: { height: 230, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  page: { width: 150, height: 186, backgroundColor: '#fff', borderRadius: 8, padding: 8, gap: 6, boxShadow: '0 8px 20px rgba(60,40,30,0.16)' },
  photo: { borderRadius: 4, overflow: 'hidden', backgroundColor: colors.card2 },
  ring: { ...StyleSheet.absoluteFill, borderRadius: 4, borderWidth: 3, borderColor: colors.coralAction },
  finger: { position: 'absolute', right: 18, bottom: 6 },
  menu: { position: 'absolute', left: -40, right: -40, bottom: -34, flexDirection: 'row', gap: 6, backgroundColor: colors.bg, borderRadius: 16, padding: 8, boxShadow: '0 -4px 16px rgba(60,40,30,0.14)' },
  mItem: { flex: 1, alignItems: 'center', gap: 4, backgroundColor: colors.card, borderRadius: 12, paddingVertical: 8 },
  mIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  mText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.fg },
  pinWrap: { position: 'absolute', left: 40, bottom: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pin: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.coralAction, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pinN: { fontSize: 11, fontFamily: fonts.bold, color: '#fff' },
  note: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' },
  noteText: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.fg },
  fix: { position: 'absolute', bottom: -40, alignSelf: 'center', backgroundColor: colors.coralAction, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6 },
  fixText: { fontSize: 12, fontFamily: fonts.semibold, color: '#fff' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.card2 },
  dotOn: { width: 18, backgroundColor: colors.coralAction },
  title: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  text: { fontSize: 15, lineHeight: 21, fontFamily: fonts.medium, color: colors.mut },
  btns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: { flex: 1, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.card },
  btnGhostText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.fg },
  btnMain: { backgroundColor: colors.coralAction },
  btnMainText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
});
