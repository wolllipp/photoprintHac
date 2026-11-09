/**
 * Общий альбом по QR-коду (UC-G1): организатор показывает код — гости сканируют и загружают фото
 * со страницы в браузере, без установки приложения. Организатор видит, как альбом наполняется,
 * и собирает книгу из всех снимков. В продукте — POST /shared-albums, поток загрузок по WebSocket.
 * Здесь новые фото приходят по таймеру (DEMO_MODE).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ShareNetworkIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { LinearTransition, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { sharedAlbums } from '@/data/demo';
import { pic, type PhotoName } from '@/data/photos';
import { AnimatedNumber, enterItem, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

const INCOMING: PhotoName[] = ['friends-selfie', 'concert', 'birthday-cake', 'friends-night', 'bouquet', 'cafe-interior', 'night-window', 'roses'];
const FACES: PhotoName[] = ['friends-selfie', 'friends-night', 'concert'];

export default function Shared() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ id: string; name?: string; fresh?: string }>();
  const known = sharedAlbums.find((a) => a.id === p.id);
  const fresh = p.fresh === '1'; // только что создан — альбом пустой, гости ещё не пришли
  const LINK = `https://picpac.by/a/${p.id}`;
  const [name, setName] = useState(p.name ?? known?.name ?? 'Общий альбом');
  const [got, setGot] = useState(fresh ? 0 : 3); // сколько новых фото уже пришло
  const base = fresh ? { photos: 0, guests: 0 } : { photos: (known?.photos ?? 41) - 3, guests: (known?.guests ?? 7) - 1 };
  const guests = base.guests + Math.ceil(got / 3);
  const total = base.photos + got;

  // гости загружают фото — альбом наполняется на глазах (у нового — после паузы, будто первый гость отсканировал код)
  useEffect(() => {
    if (got >= INCOMING.length) return;
    const t = setTimeout(() => setGot((n) => n + 1), got === 0 && fresh ? 5000 : 2600);
    return () => clearTimeout(t);
  }, [got, fresh]);

  const share = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Share.share({ message: `Добавляйте фото в альбом «${name}»: ${LINK}` }).catch(() => {});
  };

  const recent = INCOMING.slice(0, got).reverse();

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title={fresh ? 'Альбом создан' : 'Общий альбом'} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={enterItem(0)} style={{ gap: 4 }}>
          <TextInput value={name} onChangeText={setName} style={s.name} accessibilityLabel="Название альбома" />
          <Text style={s.lead}>Гости сканируют код и добавляют фото со своего телефона — без приложения и регистрации.</Text>
        </Animated.View>

        {/* код */}
        <Animated.View entering={enterItem(1)} style={s.qrCard}>
          <View style={s.qrBox} accessible accessibilityLabel={`QR-код альбома, ссылка ${LINK}`}>
            <QRCode value={LINK} size={196} color={colors.fg} backgroundColor="#fff" ecl="M" />
          </View>
          <Text style={s.link} selectable>picpac.by/a/{p.id}</Text>
          <View style={s.btns}>
            <Tap style={[s.btn, s.btnPrimary]} onPress={share} accessibilityRole="button">
              <ShareNetworkIcon size={18} color="#fff" weight="bold" />
              <Text style={s.btnPrimaryText}>Поделиться</Text>
            </Tap>
          </View>
        </Animated.View>

        {/* живой счётчик */}
        <Animated.View entering={enterItem(2)} style={s.live}>
          <View style={s.liveHead}>
            <View style={s.faces}>
              {FACES.slice(0, Math.min(3, guests)).map((k, i) => (
                <Image key={k} source={pic(k)} style={[s.face, { marginLeft: i === 0 ? 0 : -10, zIndex: FACES.length - i }]} contentFit="cover" />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.countRow}>
                <AnimatedNumber value={total} format={String} style={s.count} />
                <Text style={s.countOf}>фото</Text>
              </View>
              <View style={s.countRow}>
                <Text style={s.small}>от </Text>
                <AnimatedNumber value={guests} format={String} style={s.small} />
                <Text style={s.small}> гостей · обновляется вживую</Text>
              </View>
            </View>
            <View style={s.dot} />
          </View>
          <View style={s.strip}>
            {recent.length === 0 ? <ThinkingLine text="Ждём первых гостей — покажите им код" style={s.small} /> : null}
            {recent.map((k) => (
              <Animated.View
                key={k}
                entering={ZoomIn.springify().damping(15).reduceMotion(ReduceMotion.System)}
                layout={LinearTransition.springify().damping(20).reduceMotion(ReduceMotion.System)}
                style={s.thumb}>
                <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* как это работает */}
        <Animated.View entering={enterItem(3)} style={s.how}>
          <Step n={1} text="Покажите код на экране или распечатайте карточки на столы" />
          <Step n={2} text="Гости открывают ссылку и загружают фото — без приложения" />
          <Step n={3} text="Вы собираете книгу из всех снимков за пару минут" />
        </Animated.View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={s.cta} onPress={() => router.push('/build')} accessibilityRole="button">
          <Text style={s.ctaText}>Собрать книгу из альбома</Text>
        </Tap>
      </View>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={s.step}>
      <View style={s.stepN}>
        <Text style={s.stepNText}>{n}</Text>
      </View>
      <Text style={s.stepText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 18, gap: 14, paddingTop: 4 },
  name: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg, padding: 0 },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut },
  qrCard: { backgroundColor: colors.card, borderRadius: 26, padding: 18, alignItems: 'center', gap: 12 },
  qrBox: { backgroundColor: '#fff', borderRadius: 22, padding: 16 },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  btns: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  btn: { flex: 1, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimary: { backgroundColor: colors.coralAction },
  btnPrimaryText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  live: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 12 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  faces: { flexDirection: 'row' },
  face: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.card },
  countRow: { flexDirection: 'row', alignItems: 'baseline' },
  count: { fontSize: 26, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg, fontVariant: ['tabular-nums'] },
  countOf: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut, marginLeft: 6 },
  small: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.coralAction, alignSelf: 'flex-start', marginTop: 6 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, overflow: 'hidden' },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card2 },
  how: { backgroundColor: colors.peach, borderRadius: 26, padding: 16, gap: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepNText: { fontSize: 13, fontFamily: fonts.display, color: colors.peachInk },
  stepText: { flex: 1, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.medium, color: colors.fg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingTop: 10, backgroundColor: 'rgba(255,255,255,0.94)' },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.fg, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
