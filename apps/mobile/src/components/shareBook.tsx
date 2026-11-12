/**
 * Поделиться книгой (G3): друг видит красивый предпросмотр и «собрать свою» со скидкой,
 * вы получаете пики, когда он закажет. Ссылка ведёт на веб-страницу предпросмотра (без приложения).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {  } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pik, Tap } from '@/components/ui';
import { pic, type Pic } from '@/data/photos';
import { SHEET_TAIL, sheetIn } from '@/motion';
import { colors, fonts } from '@/theme';

/** «Карелия, июль» → karelia-iyul — короткий адрес ссылки. */
function slug(t: string) {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  return t.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'book';
}

export function ShareBookSheet({ visible, title, cover, meta, onClose }: { visible: boolean; title: string; cover: Pic; meta: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const link = `picpac.by/b/${slug(title)}`;
  const send = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Share.share({ message: `Смотри, какую книгу я собрал в picPac — «${title}». Собери свою со скидкой 10%: https://${link}` }).catch(() => {});
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        <Animated.View entering={sheetIn} style={[s.sheet, { marginBottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }]}>
          <View style={s.grab} />
          <Text style={s.title}>Поделиться книгой</Text>

          {/* как увидит друг */}
          <View style={s.preview}>
            <Image source={pic(cover)} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
            <View style={s.previewText}>
              <Text style={s.previewTitle} numberOfLines={1}>{title}</Text>
              <Text style={s.previewMeta}>{meta}</Text>
            </View>
          </View>
          <Text style={s.link}>{link}</Text>

          <View style={s.deal}>
            <View style={s.dealRow}>
              <Text style={s.dealWho}>Другу</Text>
              <Text style={s.dealWhat}>−10% на первую книгу</Text>
            </View>
            <View style={s.dealRow}>
              <Text style={s.dealWho}>Вам</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={s.dealWhat}>+100</Text>
                <Pik size={18} />
                <Text style={s.dealWhat}>когда он закажет</Text>
              </View>
            </View>
          </View>

          <Tap style={s.cta} onPress={send} accessibilityRole="button">
            <Text style={s.ctaText}>Отправить</Text>
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
  preview: { height: 170, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.card2, justifyContent: 'flex-end' },
  previewText: { padding: 14 },
  previewTitle: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.4, color: '#fff' },
  previewMeta: { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  link: { fontSize: 14, fontFamily: fonts.semibold, color: colors.mut, paddingHorizontal: 14, marginTop: -4 },
  deal: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 10 },
  dealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dealWho: { fontSize: 14, fontFamily: fonts.medium, color: colors.mut },
  dealWhat: { fontSize: 15, fontFamily: fonts.bold, color: colors.fg },
  cta: { height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
