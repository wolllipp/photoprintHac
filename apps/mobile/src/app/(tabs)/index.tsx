import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { CaretRightIcon, ImagesSquareIcon } from 'phosphor-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BooksFeed } from '@/components/feed';
import { NowBlock, PlainTopBar, StoryRow } from '@/components/home';
import { PicksViewer } from '@/components/picks';
import { SoonBlock } from '@/components/soon';
import { Tap } from '@/components/ui';
import { suggestions } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

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
        {/* книга из альбома айфона — в одно касание (app/albums.tsx) */}
        <Tap style={s.albums} onPress={() => router.push('/albums')} accessibilityRole="button" accessibilityLabel="Книга из альбома айфона">
          <View style={s.albumsIcon}>
            <ImagesSquareIcon size={22} color={colors.peachInk} weight="bold" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.albumsTitle}>Книга из альбома</Text>
            <Text style={s.albumsSub}>Выберите альбом айфона — соберём коллажами</Text>
          </View>
          <CaretRightIcon size={18} color={colors.mut} weight="bold" />
        </Tap>
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
  albums: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 14, marginTop: -8 },
  albumsIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' },
  albumsTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  albumsSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
});
