/**
 * «Проблема с заказом» — обращение в поддержку, привязанное к заказу (ТЗ, путь клиента п. 8):
 * тема одним нажатием, пара слов своими словами (или голосом с клавиатуры), «Отправить».
 * Заказ с сервера — обращение уходит туда (POST /orders/{id}/support), номер и срок ответа приходят оттуда;
 * без сервера — сохраняется в приложении.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supportOnServer } from '@/api/book';
import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { useStore, type PlacedOrder, type SupportTicket } from '@/data/store';
import { SuccessCheck } from '@/motion';
import { colors, fonts } from '@/theme';

export const TOPICS = [
  { id: 'defect', title: 'Брак печати', hint: 'Что не так: полосы, цвет, склейка? Можно приложить фото в ответе поддержке' },
  { id: 'delay', title: 'Задерживается', hint: 'Когда ждали и что видите в статусе' },
  { id: 'layout', title: 'Ошибка в книге', hint: 'Какая страница и что поправить' },
  { id: 'delivery', title: 'Доставка', hint: 'Пункт выдачи, курьер, адрес' },
  { id: 'other', title: 'Другое', hint: 'Опишите, что случилось' },
] as const;
export const topicTitle = (id: string) => TOPICS.find((t) => t.id === id)?.title ?? 'Обращение';
const hours = (n: number) => `${n} ${n === 1 ? 'час' : n < 5 ? 'часа' : 'часов'}`;

export function SupportSheet({ order, onClose }: { order: PlacedOrder; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { addSupport } = useStore();
  const [topic, setTopic] = useState<string>(order.stage >= 4 ? 'defect' : 'delay');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SupportTicket | null>(null);
  const hint = TOPICS.find((t) => t.id === topic)?.hint ?? '';
  const ok = text.trim().length >= 3;

  const send = async () => {
    if (!ok || sending) return;
    setSending(true);
    let ticket: SupportTicket = { number: 10000 + (Date.now() % 9000), topic, text: text.trim(), at: Date.now(), status: 'open', slaHours: 4 };
    if (order.serverId) {
      try {
        const r = await supportOnServer(order.serverId, topic, text.trim());
        ticket = { ...ticket, number: r.number, slaHours: r.sla_hours };
      } catch {}
    }
    addSupport(order.id, ticket);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setSending(false);
    setSent(ticket);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grab} />
          {sent ? (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: 14, alignItems: 'center', paddingVertical: 8 }}>
              <SuccessCheck size={44} />
              <Text style={[s.title, { textAlign: 'center' }]}>Обращение №{sent.number} принято</Text>
              <Text style={[s.sub, { textAlign: 'center' }]}>
                {topicTitle(sent.topic)} · заказ «{order.title}». Ответим в течение {hours(sent.slaHours)} — придёт уведомление, ответ будет здесь, в заказе.
              </Text>
              <Tap style={[s.send, { alignSelf: 'stretch' }]} onPress={onClose} accessibilityRole="button">
                <Text style={s.sendText}>Готово</Text>
              </Tap>
            </Animated.View>
          ) : (
            <>
              <View style={s.head}>
                <Image source={pic(order.cover)} style={s.cover} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>Проблема с заказом</Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {order.title} · {order.live.split(' · ')[0]}
                  </Text>
                </View>
              </View>
              <View style={s.chips} accessibilityRole="radiogroup">
                {TOPICS.map((t) => {
                  const on = t.id === topic;
                  return (
                    <Tap
                      key={t.id}
                      style={[s.chip, on && s.chipOn]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setTopic(t.id);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}>
                      <Text style={[s.chipText, on && { color: '#fff' }]}>{t.title}</Text>
                    </Tap>
                  );
                })}
              </View>
              <TextInput
                style={s.input}
                value={text}
                onChangeText={setText}
                placeholder={hint}
                placeholderTextColor={colors.mut}
                multiline
                maxLength={2000}
                accessibilityLabel="Что случилось"
              />
              <Tap style={[s.send, !ok && { opacity: 0.45 }]} onPress={send} disabled={!ok || sending} accessibilityRole="button">
                <Text style={s.sendText}>{sending ? 'Отправляем…' : 'Отправить'}</Text>
              </Tap>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { marginTop: 'auto', backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.card2 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  sub: { fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.mut },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.coralAction },
  chipText: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.fg },
  input: { minHeight: 96, maxHeight: 160, backgroundColor: colors.card, borderRadius: 18, padding: 14, paddingTop: 14, fontSize: 16, fontFamily: fonts.medium, color: colors.fg, textAlignVertical: 'top' },
  send: { height: 52, borderRadius: 26, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 16, fontFamily: fonts.semibold, color: '#fff' },
});
