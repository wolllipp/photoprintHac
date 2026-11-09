/**
 * Черновики: книги, которые ИИ уже собрал из фото. Открыть → выбрать тариф → в корзину.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { suggestions } from '@/data/demo';
import { pic } from '@/data/photos';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Drafts() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <NavBar title="" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={s.title}>Черновики</Text>
        <Text style={s.lead}>Собрали из ваших фото. Откройте, поправьте, если нужно, и закажите.</Text>
        {suggestions.map((d, i) => (
          <Animated.View key={d.id} entering={enterItem(i)}>
            <Tap
              style={s.card}
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: d.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${d.title}, ${d.meta}`}>
              <Image source={pic(d.photo)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
              <View style={s.tag}>
                <Text style={s.tagText}>{d.tag}</Text>
              </View>
              <View>
                <Text style={s.cardTitle}>{d.title}</Text>
                <Text style={s.cardSub}>{d.meta}</Text>
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
  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut, marginBottom: 4 },
  card: { height: 170, borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card2, padding: 14, justifyContent: 'space-between' },
  tag: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  tagText: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.fg },
  cardTitle: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: '#fff' },
  cardSub: { fontSize: 13.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});
