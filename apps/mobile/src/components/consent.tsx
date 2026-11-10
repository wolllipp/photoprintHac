/**
 * Согласие на обработку фото ИИ (A14) — один раз, перед первой сборкой.
 * Три обещания простыми словами, «Согласен» и «Не сейчас». Ответ хранится в приложении;
 * отозвать и удалить фото — в профиле.
 */
import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { colors, fonts } from '@/theme';

const POINTS = [
  { title: 'Обрабатываем внутри «Фотопринта»', text: 'ИИ работает на наших серверах в Беларуси. Фото не уходят в чужие ИИ-сервисы.' },
  { title: 'Никому не передаём', text: 'Ни третьим лицам, ни для обучения моделей.' },
  { title: 'Удаляем после заказа', text: 'Через 30 дней после получения книги. Раньше — в профиле, в одно касание.' },
];

export function ConsentSheet({ visible, onAccept, onClose }: { visible: boolean; onAccept: () => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        <Animated.View entering={SlideInDown.duration(340).easing(Easing.out(Easing.cubic))} style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grab} />
          <Text style={s.title}>Ваши фото остаются у нас</Text>
          <Text style={s.lead}>Чтобы собрать книгу, ИИ посмотрит ваши фото: отберёт лучшие и проверит, чтобы лица не попали в обрез.</Text>

          <View style={s.points}>
            {POINTS.map((p, i) => (
              <View key={p.title} style={s.point}>
                <Text style={s.num}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pTitle}>{p.title}</Text>
                  <Text style={s.pText}>{p.text}</Text>
                </View>
              </View>
            ))}
          </View>

          <Tap
            style={s.cta}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onAccept();
            }}
            accessibilityRole="button">
            <Text style={s.ctaText}>Согласен, собрать книгу</Text>
          </Tap>
          <Tap style={s.later} onPress={onClose} accessibilityRole="button">
            <Text style={s.laterText}>Не сейчас</Text>
          </Tap>
          <Text style={s.foot}>Нажимая «Согласен», вы принимаете политику обработки персональных данных</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },
  points: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 14 },
  point: { flexDirection: 'row', gap: 12 },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 13, fontFamily: fonts.display, color: colors.coralAction },
  pTitle: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg },
  pText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  later: { height: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.mut },
  foot: { fontSize: 12, lineHeight: 16, fontFamily: fonts.regular, color: colors.mut2, textAlign: 'center' },
});
