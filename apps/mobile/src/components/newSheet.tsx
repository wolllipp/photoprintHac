/**
 * Лист «Создать» — открывается плюсом на главной. Четыре крупные плитки-кнопки без фото — цвет и значок:
 * книга из своих фото (главная, крупная), книга по описанию (с микрофоном), печать фото и общий альбом.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ArrowRightIcon, LinkSimpleIcon, MicrophoneIcon } from 'phosphor-react-native';
import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { pic } from '@/data/photos';
import { tiles } from '@/data/demo';
import { SHEET_TAIL, sheetIn } from '@/motion';
import { colors, fonts } from '@/theme';

export type NewChoice = 'photos' | 'words' | 'voice' | 'print' | 'shared';

/** onDismissed — лист полностью закрылся (iOS): только после этого можно открыть галерею. */
export function NewSheet({ visible, onClose, onPick, onDismissed }: { visible: boolean; onClose: () => void; onPick: (c: NewChoice) => void; onDismissed?: () => void }) {
  const insets = useSafeAreaInsets();
  // свернуть пальцем: лист едет вниз за пальцем; дотянул дальше 120 точек или смахнул — закрывается
  const y = useSharedValue(0);
  const h = useSharedValue(600);
  useEffect(() => {
    if (visible) y.set(0);
  }, [visible, y]);
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      // вниз — 1:1, вверх — почти не пускаем
      y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15);
    },
    onDeactivate: (e) => {
      'worklet';
      if (y.value > 120 || e.velocityY > 800) {
        y.set(
          withTiming(h.value, { duration: 200, easing: Easing.in(Easing.quad) }, (done) => {
            if (done) scheduleOnRN(onClose);
          }),
        );
      } else {
        y.set(withSpring(0, { damping: 26, stiffness: 260 }));
      }
    },
  });
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, y.value / h.value) }));
  const pick = (c: NewChoice) => {
    Haptics.selectionAsync().catch(() => {});
    onPick(c);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} onDismiss={onDismissed}>
      {/* внутри Modal жестам нужен свой корень */}
      <GestureHandlerRootView style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[StyleSheet.absoluteFill, dim]}>
          <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
        </Animated.View>
        <GestureDetector gesture={pan}>
        <Animated.View
          entering={sheetIn}
          onLayout={(e) => {
            h.set(e.nativeEvent.layout.height);
          }}
          style={[s.sheet, { marginBottom: -SHEET_TAIL, paddingBottom: insets.bottom + 16 + SHEET_TAIL }, slide]}>
          <View style={s.grab} />
          <Text style={s.title}>Что создаём?</Text>

          {/* главное — книга из своих фото: на всю ширину */}
          <ActionTile
            main
            tall
            icon={<ArtPhotos />}
            title="Книга из фото"
            sub="Выберите снимки — соберём сами"
            onPress={() => pick('photos')}
          />

          <View style={s.row}>
            <ActionTile
              icon={<ArtWords />}
              title="По описанию"
              sub="Напишите или скажите, о чём книга"
              onPress={() => pick('words')}
              corner={
                <Tap onPress={() => pick('voice')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Рассказать голосом">
                  <View style={s.mic}>
                    <MicrophoneIcon size={16} color="#fff" weight="fill" />
                  </View>
                </Tap>
              }
            />
            <ActionTile icon={<ArtPrint />} title="Печать фото" sub={`${tiles.printFrom} за снимок`} onPress={() => pick('print')} />
          </View>

          <ActionTile
            wide
            icon={<ArtLink />}
            title="Общий альбом"
            sub="Отправьте ссылку родным — каждый добавит свои фото"
            onPress={() => pick('shared')}
          />
        </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

/* ---------- что внутри плитки: настоящее содержимое, а не рисунки ---------- */

/** Стопка ваших снимков → раскрытый альбом из них: «вот из этого соберём книгу». Фото без людей. */
function ArtPhotos() {
  return (
    <View style={s.flow}>
      <View style={s.pile}>
        <Image source={pic('roses')} style={[s.pilePic, { left: 0, top: 8, transform: [{ rotate: '-8deg' }] }]} contentFit="cover" />
        <Image source={pic('cafe-dessert')} style={[s.pilePic, { left: 18, top: 2, transform: [{ rotate: '5deg' }] }]} contentFit="cover" />
        <Image source={pic('city-sunset')} style={[s.pilePic, { left: 34, top: 10, transform: [{ rotate: '-2deg' }] }]} contentFit="cover" />
      </View>
      <ArrowRightIcon size={22} color="#fff" weight="bold" />
      <View style={s.album}>
        <Image source={pic('city-sunset')} style={s.albumPage} contentFit="cover" />
        <View style={s.albumSpine} />
        <Image source={pic('night-window')} style={s.albumPage} contentFit="cover" />
      </View>
    </View>
  );
}

/** Пример фразы — понятно, что именно написать. */
function ArtWords() {
  return (
    <View style={s.quote}>
      <Text style={s.quoteText}>«Поездка в Карелию, 24 страницы»</Text>
    </View>
  );
}

/** Один настоящий отпечаток с белыми полями. */
function ArtPrint() {
  return (
    <View style={s.print}>
      <Image source={pic('cafe-dessert')} style={{ flex: 1 }} contentFit="cover" />
    </View>
  );
}

/** Так выглядит ссылка, которую отправят родным. */
function ArtLink() {
  return (
    <View style={s.linkPill}>
      <LinkSimpleIcon size={14} color={colors.peachInk} weight="bold" />
      <Text style={s.linkText}>picpac.by/a/yubiley-dedushki</Text>
    </View>
  );
}

/**
 * Плитка-кнопка без фото: ровный цвет, сверху мини-иллюстрация того, что получится, внизу название и подпись.
 * main — главная (коралловая, белый текст), остальные — тёплые светлые.
 */
function ActionTile({ icon, title, sub, onPress, tall, wide, main, corner }: { icon: ReactNode; title: string; sub: string; onPress: () => void; tall?: boolean; wide?: boolean; main?: boolean; corner?: ReactNode }) {
  return (
    <Tap style={[s.tile, tall ? s.tall : wide ? s.wide : s.half, main ? s.tileMain : s.tilePlain]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`}>
      <View style={[s.tileTop, main && { justifyContent: 'center' }]}>
        <View style={s.art}>{icon}</View>
        {/* микрофон — по центру облачка, а не прижат к верху */}
        {corner ? <View style={{ alignSelf: 'center' }}>{corner}</View> : null}
      </View>
      <View style={main && { alignItems: 'center' }}>
        <Text style={[s.tileTitle, main && { color: '#fff', textAlign: 'center' }, tall && { fontSize: 24, lineHeight: 29 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {title}
        </Text>
        <Text style={[s.tileSub, main && { color: 'rgba(255,255,255,0.9)', textAlign: 'center' }]}>
          {sub}
        </Text>
      </View>
    </Tap>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(20,16,14,0.35)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  grab: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.card2 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingHorizontal: 4, marginBottom: 2 },
  row: { flexDirection: 'row', gap: 10 },
  tile: { borderRadius: 24, overflow: 'hidden', padding: 16, gap: 14, justifyContent: 'space-between' },
  tileMain: { backgroundColor: colors.coralAction },
  tilePlain: { backgroundColor: colors.card },
  tall: { minHeight: 150 },
  half: { flex: 1, minHeight: 170 },
  wide: { minHeight: 120 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  art: { flexShrink: 1 },
  /* содержимое плиток */
  flow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  pile: { width: 86, height: 66 },
  pilePic: { position: 'absolute', width: 46, height: 54, borderRadius: 8, borderWidth: 2.5, borderColor: '#fff' },
  album: { flexDirection: 'row', width: 104, height: 66, padding: 4, borderRadius: 8, backgroundColor: '#fff', boxShadow: '0 6px 14px rgba(0,0,0,0.2)' },
  albumPage: { flex: 1, borderRadius: 3 },
  albumSpine: { width: 2, marginHorizontal: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  quote: { backgroundColor: '#fff', borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 10, paddingVertical: 8 },
  quoteText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.fg },
  print: { width: 84, height: 104, backgroundColor: '#fff', padding: 5, paddingBottom: 16, borderRadius: 5 },
  linkPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#fff' },
  linkText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.fg },
  mic: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  tileTitle: { fontSize: 18, lineHeight: 23, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  tileSub: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
});
