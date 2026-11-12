/**
 * Согласие на обработку фото ИИ (A14) — один раз, перед первой загрузкой фото на любом пути
 * (книга из фото, по описанию, печать, общий альбом; план notes/30-audit, п. 1.15).
 * Три обещания простыми словами, «Согласен» и «Не сейчас». Ответ хранится в приложении (aiConsent);
 * отозвать — в профиле. Тексты ждут юриста (план, «Спорное», п. 4).
 */
import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {  } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { SHEET_TAIL, sheetIn } from '@/motion';
import { colors, fonts } from '@/theme';

const POINTS = [
  { title: 'Обрабатываем внутри «Фотопринта»', text: 'ИИ работает на наших серверах в Беларуси. Фото не уходят в чужие ИИ-сервисы.' },
  { title: 'Никому не передаём', text: 'Ни третьим лицам, ни для обучения моделей.' },
  { title: 'Удаляем после заказа', text: 'Через 30 дней после получения заказа. Обработку ИИ можно выключить в профиле.' },
];

/**
 * cta — текст кнопки под путь («собрать книгу», «выбрать фото»).
 * onDismissed — лист закрылся полностью (iOS не откроет галерею поверх закрывающегося окна).
 */
export function ConsentSheet({ visible, onAccept, onClose, cta = 'Согласен, собрать книгу', onDismissed }: { visible: boolean; onAccept: () => void; onClose: () => void; cta?: string; onDismissed?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismissed}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        <Animated.View entering={sheetIn} style={[s.sheet, { marginBottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
          <View style={s.grab} />
          <Text style={s.title}>Ваши фото остаются у нас</Text>
          <Text style={s.lead}>ИИ посмотрит фото, которые вы выберете: отберёт лучшие, проверит резкость и чтобы лица не попали в обрез.</Text>

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

          <Text style={s.foot}>Нажимая «Согласен», вы принимаете политику обработки персональных данных</Text>
          <Tap
            style={s.cta}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              onAccept();
            }}
            accessibilityRole="button">
            <Text style={s.ctaText}>{cta}</Text>
          </Tap>
          <Tap style={s.later} onPress={onClose} accessibilityRole="button">
            <Text style={s.laterText}>Не сейчас</Text>
          </Tap>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingHorizontal: 14 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut, paddingHorizontal: 14 },
  points: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 14 },
  point: { flexDirection: 'row', gap: 12 },
  num: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 13, fontFamily: fonts.display, color: colors.coralAction },
  pTitle: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.fg },
  pText: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  later: { height: 44, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.mut },
  foot: { fontSize: 12, lineHeight: 16, fontFamily: fonts.regular, color: colors.mut2, paddingHorizontal: 14, marginTop: -4 },
});
