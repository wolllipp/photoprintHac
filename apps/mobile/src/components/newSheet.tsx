/**
 * Лист «Создать» — открывается плюсом на главной. Главное действие — книга из выбранных фото
 * (человек выбирает сам, ИИ видит только эти снимки). Ниже — книга по описанию, фотопечать, общий альбом.
 */
import * as Haptics from 'expo-haptics';
import { ImagesIcon, MicrophoneIcon, PencilSimpleLineIcon, PrinterIcon, QrCodeIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { tiles } from '@/data/demo';
import { colors, fonts } from '@/theme';

export type NewChoice = 'photos' | 'words' | 'voice' | 'print' | 'shared';

export function NewSheet({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: NewChoice) => void }) {
  const insets = useSafeAreaInsets();
  const pick = (c: NewChoice) => {
    Haptics.selectionAsync().catch(() => {});
    onPick(c);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        <Animated.View entering={SlideInDown.duration(320).easing(Easing.out(Easing.cubic))} style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={s.grab} />
          <Text style={s.title}>Создать</Text>

          {/* главное: книга из своих фото */}
          <Tap style={s.main} onPress={() => pick('photos')} accessibilityRole="button" accessibilityLabel="Книга из фото: выберите снимки, книгу соберём сами">
            <View style={[s.icon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <ImagesIcon size={22} color="#fff" weight="fill" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, { color: '#fff', fontSize: 19 }]}>Книга из фото</Text>
              <Text style={[s.rowSub, { color: 'rgba(255,255,255,0.88)' }]}>Выберите снимки — соберём сами</Text>
            </View>
          </Tap>

          <View style={s.group}>
            <Row
              icon={<PencilSimpleLineIcon size={20} color={colors.peachInk} weight="bold" />}
              title="Книга по описанию"
              sub="Напишите, о чём она, — найдём фото"
              onPress={() => pick('words')}
              right={
                <Tap style={s.mic} onPress={() => pick('voice')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Сказать голосом">
                  <MicrophoneIcon size={17} color={colors.peachInk} weight="fill" />
                </Tap>
              }
            />
            <View style={s.line} />
            <Row icon={<PrinterIcon size={20} color={colors.peachInk} weight="bold" />} title="Печать фото" sub={`${tiles.printFrom} за снимок`} onPress={() => pick('print')} />
            <View style={s.line} />
            <Row icon={<QrCodeIcon size={20} color={colors.peachInk} weight="bold" />} title="Общий альбом" sub="Гости добавляют фото по QR-коду" onPress={() => pick('shared')} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Row({ icon, title, sub, onPress, right }: { icon: ReactNode; title: string; sub: string; onPress: () => void; right?: ReactNode }) {
  return (
    <View style={s.row}>
      <Tap style={s.rowTap} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
        <View style={[s.icon, { backgroundColor: colors.peach }]}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.rowSub} numberOfLines={1}>{sub}</Text>
        </View>
      </Tap>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingHorizontal: 6 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 84, borderRadius: 26, backgroundColor: colors.coralAction, paddingHorizontal: 16, paddingVertical: 14 },
  group: { backgroundColor: colors.card, borderRadius: 26, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16.5, lineHeight: 21, fontFamily: fonts.bold, color: colors.fg },
  rowSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hair, marginLeft: 58 },
});
