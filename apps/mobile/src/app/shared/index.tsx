/**
 * Общие альбомы: все альбомы, которые собираются вместе с гостями, и «Создать новый».
 * Карточка ведёт на код и живое наполнение альбома.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CaretLeftIcon, PlusIcon } from 'phosphor-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { sharedAlbums } from '@/data/demo';
import { pic } from '@/data/photos';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

export default function SharedList() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* «назад» и заголовок — в одну линию */}
      <View style={s.head}>
        <Tap style={s.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
          <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
        <Text style={s.title} accessibilityRole="header">Общие альбомы</Text>
      </View>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={s.lead}>Отправьте ссылку родным — каждый добавит свои фото, без приложения. Из всех снимков — одна книга.</Text>

        <Tap style={s.create} onPress={() => router.push('/shared/new')} accessibilityRole="button">
          <View style={s.plus}>
            <PlusIcon size={20} color="#fff" weight="bold" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.createTitle}>Создать новый</Text>
            <Text style={s.createSub}>юбилей, свадьба, поездка — займёт минуту</Text>
          </View>
        </Tap>

        {sharedAlbums.map((a, i) => (
          <Animated.View key={a.id} entering={enterItem(i + 1)}>
            <Tap
              style={s.card}
              onPress={() => router.push({ pathname: '/shared/[id]', params: { id: a.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}, ${a.photos} фото от ${a.guests} гостей, ${a.status}`}>
              <Image source={pic(a.photo)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
              <View style={[s.status, a.open && s.statusOpen]}>
                {a.open ? <View style={s.liveDot} /> : null}
                <Text style={[s.statusText, a.open && { color: colors.fg }]}>{a.status}</Text>
              </View>
              <View style={s.cardFoot}>
                <Text style={s.cardTitle} numberOfLines={1}>{a.name}</Text>
                <Text style={s.cardSub}>{a.photos} фото · {a.guests} гостей</Text>
              </View>
            </Tap>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 30, lineHeight: 36, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut, marginBottom: 4 },
  create: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.peach, borderRadius: 26, padding: 16 },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  createTitle: { fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  createSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
  card: { height: 190, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card2, justifyContent: 'space-between', padding: 14 },
  status: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
  statusOpen: { backgroundColor: 'rgba(255,255,255,0.92)' },
  statusText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.coralAction },
  cardFoot: { gap: 2 },
  cardTitle: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: '#fff' },
  cardSub: { fontSize: 13.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.85)' },
});
