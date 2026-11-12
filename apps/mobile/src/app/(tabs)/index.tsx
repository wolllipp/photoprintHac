import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BooksFeed } from '@/components/feed';
import { NowBlock, PlainTopBar, StoryRow } from '@/components/home';
import { PicksViewer } from '@/components/picks';
import { SoonBlock } from '@/components/soon';
import { suggestions } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { points, signedIn, setCreating } = useStore();
  // какая подборка открыта на весь экран и какие уже смотрели (серое кольцо)
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" animated />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 96 }]} showsVerticalScrollIndicator={false}>
        <PlainTopBar points={signedIn ? points : null} />
        <StoryRow items={suggestions} seen={seen} onNew={() => setCreating(true)} onOpen={setOpen} />
        <NowBlock />
        <SoonBlock />
        <BooksFeed />
      </ScrollView>

      <PicksViewer
        items={suggestions}
        start={open}
        onClose={() => setOpen(null)}
        onSeen={(id) => setSeen((x) => (x.includes(id) ? x : [...x, id]))}
        onOpenBook={(id) => {
          setOpen(null);
          router.push({ pathname: '/review', params: { id } });
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 24 },
});
