import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskField, MiniServices, MyAlbums, OrderStrip, Suggestions, TopBar } from '@/components/home';
import { albums, currentOrder, points, suggestions } from '@/data/demo';
import { colors } from '@/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 110 }]}
      showsVerticalScrollIndicator={false}>
      <TopBar initial="И" points={points} />
      <AskField />
      <Suggestions items={suggestions} />
      <MyAlbums items={albums} />
      <MiniServices />
      <OrderStrip order={currentOrder} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 18, gap: 18 },
});
