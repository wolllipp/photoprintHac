import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskField, MiniServices, MyAlbums, OrderStrip, Suggestions, TopBar } from '@/components/home';
import { albums, currentOrder, suggestions } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { points } = useStore();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}>
      <TopBar initial="И" points={points} />
      <AskField onPress={() => router.push('/story')} onMic={() => router.push({ pathname: '/story', params: { voice: '1' } })} />
      <Suggestions items={suggestions} onOpen={(id) => router.push({ pathname: '/book/[id]', params: { id } })} />
      <MyAlbums items={albums} />
      <MiniServices />
      <OrderStrip order={currentOrder} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 18 },
});
