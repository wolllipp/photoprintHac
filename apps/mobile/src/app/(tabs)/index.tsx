import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConsentSheet } from '@/components/consent';
import { BooksFeed } from '@/components/feed';
import { NowBlock, PlainTopBar, StoryRow } from '@/components/home';
import { PicksViewer } from '@/components/picks';
import { SoonBlock } from '@/components/soon';
import { suggestions, type Suggestion } from '@/data/demo';
import { ALBUM_PREFIX, albumSuggestions, albumsAllowed, askAlbums, bookFromAlbum } from '@/data/phoneAlbums';
import { useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

/** Кружок «Ваши альбомы» — пока доступа к фото нет: нажали — спрашиваем доступ, кружки заполняются альбомами телефона. */
const ASK_ID = 'phone:ask';
const ASK: Suggestion = {
  id: ASK_ID,
  photo: 'bouquet',
  title: 'Ваши альбомы',
  desc: '',
  meta: '',
  tag: '',
  tagTone: 'green',
  cover: ['g1', 'g2', 'g3'],
};

export default function Home() {
  const insets = useSafeAreaInsets();
  const { points, setCreating, aiConsent, setAiConsent } = useStore();
  // какая подборка открыта на весь экран и какие уже смотрели (серое кольцо)
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  // подборки в кружках — альбомы с телефона; доступа нет — первым кружок «Ваши альбомы», дальше демо-идеи
  const [albums, setAlbums] = useState<Suggestion[] | null>(null);
  const loadAlbums = useCallback(() => {
    albumSuggestions()
      .then(setAlbums)
      .catch(() => setAlbums([]));
  }, []);
  useEffect(() => {
    albumsAllowed()
      .then((ok) => ok && loadAlbums())
      .catch(() => {});
  }, [loadAlbums]);
  const items = useMemo(() => (albums && albums.length ? albums : [ASK, ...suggestions]), [albums]);

  const onOpen = (i: number) => {
    if (items[i]?.id !== ASK_ID) return setOpen(i);
    askAlbums()
      .then((ok) => (ok ? loadAlbums() : setNote('Нет доступа к фото: Настройки → Expo Go → Фото')))
      .catch(() => {});
  };

  // «Собрать эту книгу» у альбома: согласие на ИИ (один раз) → фото альбома → сборка коллажами
  const [ask, setAsk] = useState<Suggestion | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);
  const fromAlbum = (it: Suggestion) => {
    setPreparing(it.title);
    bookFromAlbum(it.id.slice(ALBUM_PREFIX.length), it.title)
      .catch((e) => setNote(e instanceof Error ? e.message : 'Не получилось взять фото из альбома'))
      .finally(() => setPreparing(null));
  };
  const openBook = (id: string) => {
    setOpen(null);
    const it = items.find((x) => x.id === id);
    if (it && id.startsWith(ALBUM_PREFIX)) {
      if (!aiConsent) return setAsk(it);
      return fromAlbum(it);
    }
    router.push({ pathname: '/review', params: { id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="dark" animated />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 96 }]} showsVerticalScrollIndicator={false}>
        <PlainTopBar points={points} />
        <StoryRow items={items} seen={seen} onNew={() => setCreating(true)} onOpen={onOpen} />
        <NowBlock />
        <SoonBlock />
        <BooksFeed />
      </ScrollView>

      <PicksViewer
        items={items}
        start={open}
        onClose={() => setOpen(null)}
        onSeen={(id) => setSeen((x) => (x.includes(id) ? x : [...x, id]))}
        onOpenBook={openBook}
      />

      {/* фото альбома готовятся к сборке (файлы и копии для экрана) — несколько секунд */}
      {preparing || note ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[s.toast, { bottom: insets.bottom + 92 }]} pointerEvents="none">
          {preparing ? <ActivityIndicator color="#fff" /> : null}
          <Text style={s.toastText}>{preparing ? `Готовим фото альбома «${preparing}»…` : note}</Text>
        </Animated.View>
      ) : null}

      <ConsentSheet
        visible={!!ask}
        onClose={() => setAsk(null)}
        onAccept={() => {
          setAiConsent(true);
          const it = ask;
          setAsk(null);
          if (it) fromAlbum(it);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 24 },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(29,33,32,0.92)', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { flex: 1, fontSize: 14.5, fontFamily: fonts.semibold, color: '#fff' },
});
