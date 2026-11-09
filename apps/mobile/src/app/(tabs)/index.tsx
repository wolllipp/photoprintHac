import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionTiles, AlbumCards, HeroPager, PlainTopBar } from '@/components/home';
import { albums, currentOrder, suggestions } from '@/data/demo';
import { useStore } from '@/data/store';
import { colors } from '@/theme';

const openBook = (id: string) => router.push({ pathname: '/book/[id]', params: { id } });

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { points, showIntro, setTabBarHidden } = useStore();
  const focused = useIsFocused();
  const [scrollY] = useState(() => new Animated.Value(0));
  const scroller = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  // статус-бар светлый, пока над ним фото; тёмный, когда кадр уехал
  const [overPhoto, setOverPhoto] = useState(true);
  // автолистание слайдов — только пока главная прокручена в самый верх
  const [atTop, setAtTop] = useState(true);

  // меню скрыто, пока виден полноэкранный кадр; на других вкладках — всегда видно
  useEffect(() => {
    setTabBarHidden(focused && showIntro && overPhoto);
  }, [focused, showIntro, overPhoto, setTabBarHidden]);

  // «Продолжить» на приветствии — плавно к плиткам
  const toTiles = () => scroller.current?.scrollTo({ y: height - insets.top - 8, animated: true });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={showIntro && overPhoto ? 'light' : 'dark'} animated />
      <Animated.ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
            const next = e.nativeEvent.contentOffset.y < height - insets.top - 40;
            if (next !== overPhoto) setOverPhoto(next);
            const top = e.nativeEvent.contentOffset.y < 30;
            if (top !== atTop) setAtTop(top);
          },
        })}>
        {showIntro ? (
          <HeroPager atTop={atTop} items={suggestions} points={points} scrollY={scrollY} onContinue={toTiles} onOpenBook={openBook} />
        ) : null}
        <View style={[s.content, { paddingTop: showIntro ? 20 : insets.top + 6 }]}>
          {showIntro ? null : <PlainTopBar points={points} />}
          <ActionTiles
            order={currentOrder}
            onAsk={() => router.push('/story')}
            onMic={() => router.push({ pathname: '/story', params: { voice: '1' } })}
            onOrder={() => router.navigate('/orders')}
          />
          <AlbumCards items={albums} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 28 },
});
