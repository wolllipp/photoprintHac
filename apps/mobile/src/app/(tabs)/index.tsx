import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BooksFeed } from '@/components/feed';
import { NowBlock, PlainTopBar, StoryRow } from '@/components/home';
import { NewSheet, type NewChoice } from '@/components/newSheet';
import { PicksViewer } from '@/components/picks';
import { SoonBlock } from '@/components/soon';
import { fitPages, suggestions } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

/** Выбрали фото в галерее — сразу собираем книгу: объём по числу снимков (в среднем 1–2 на страницу), Lite от 24 стр. */
async function bookFromPhotos() {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
  if (res.canceled || !res.assets.length) return;
  const n = res.assets.length;
  router.push({ pathname: '/build', params: { title: 'Новая книга', photos: String(n), pages: String(fitPages('lite', Math.round(n / 1.6))) } });
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { points } = useStore();
  const [creating, setCreating] = useState(false);
  // какая подборка открыта на весь экран и какие уже смотрели (серое кольцо)
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  const onPick = (c: NewChoice) => {
    setCreating(false);
    // галерею открываем, когда лист уже закрылся: iOS не покажет два окна одновременно
    if (c === 'photos') setTimeout(() => bookFromPhotos().catch(() => {}), 350);
    else if (c === 'words') router.push('/story');
    else if (c === 'voice') router.push({ pathname: '/story', params: { voice: '1' } });
    else if (c === 'print') router.push('/print');
    else router.push('/shared');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" animated />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 72 }]} showsVerticalScrollIndicator={false}>
        <PlainTopBar points={points} />
        <StoryRow items={suggestions} seen={seen} onNew={() => setCreating(true)} onOpen={setOpen} />
        <NowBlock />
        <SoonBlock />
        <BooksFeed />
      </ScrollView>

      <NewSheet visible={creating} onClose={() => setCreating(false)} onPick={onPick} />
      <PicksViewer
        items={suggestions}
        start={open}
        onClose={() => setOpen(null)}
        onSeen={(id) => setSeen((x) => (x.includes(id) ? x : [...x, id]))}
        onOpenBook={(id) => {
          setOpen(null);
          router.push({ pathname: '/book/[id]', params: { id } });
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 24 },
});
