/**
 * Лента «Ваши книги» на главной — только свои книги, без чужих людей.
 * Плитка: название, когда напечатана и какая, ниже — фото страниц
 * крупной полоской (нажатие — листание на весь экран). Ниже — одно главное действие по поводу
 * (продолжение, оценка, копия) и «Поделиться» (другу −10%, вам +100 пиков — рост через чужие соцсети).
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ExportIcon, StarIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ShareBookSheet } from '@/components/shareBook';
import { Pik, SectionHeader, Tap } from '@/components/ui';
import { bookPrice, memories, tariffs, type Memory } from '@/data/demo';
import { pic } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { colors, fonts } from '@/theme';

/** Пики за отзыв о книге (notes/16-points.md). */
const REVIEW_PIKS = 50;

export function BooksFeed() {
  const [sharing, setSharing] = useState<Memory | null>(null);
  // какую книгу листаем на весь экран и с какой страницы
  const [viewing, setViewing] = useState<{ m: Memory; at: number } | null>(null);
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader title="Ваши книги" />
      {memories.map((m, i) => (
        <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).duration(360)}>
          <FeedCard m={m} onShare={() => setSharing(m)} onView={(at) => setViewing({ m, at })} />
        </Animated.View>
      ))}
      <Modal visible={viewing !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewing(null)}>
        {viewing ? <PagesViewer m={viewing.m} start={viewing.at} onClose={() => setViewing(null)} /> : null}
      </Modal>
      <ShareBookSheet visible={sharing !== null} title={sharing?.title ?? ''} cover={sharing?.pages[0] ?? 'night-window'} meta={sharing?.meta ?? ''} onClose={() => setSharing(null)} />
    </View>
  );
}

function FeedCard({ m, onShare, onView }: { m: Memory; onShare: () => void; onView: (at: number) => void }) {
  const { orderNow, addPoints } = useStore();
  const [stars, setStars] = useState(0);
  const t = tariffs.find((x) => x.id === m.tariff) ?? tariffs[1];
  const price = bookPrice(t.id, m.format, m.pageCount, 'Глянец');

  const again = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    orderNow({ projectId: m.id, title: m.title, tariff: t.id, tariffName: t.name, format: m.format, pages: m.pageCount, finish: 'Глянец', price, readyBy: t.readyBy, cover: m.pages[0] });
    router.push('/checkout');
  };
  const sequel = () => router.push({ pathname: '/story', params: { q: `Продолжение книги «${m.title}»: осень 2026, тот же стиль, 24 страницы` } });
  const rate = (n: number) => {
    if (stars) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStars(n);
    addPoints(REVIEW_PIKS);
  };

  return (
    <View style={s.card}>
      <View style={s.top}>
        <View style={s.text}>
          <Text style={s.title} numberOfLines={2}>{m.title}</Text>
          <Text style={s.meta} numberOfLines={1}>{m.printed} · {m.meta}</Text>

          {/* приехала — спросить, как она; ответ сразу даёт пики */}
          {m.kind === 'arrived' ? (
            stars ? (
              <Animated.View entering={FadeIn.duration(250)} style={s.thanks}>
                <Text style={s.thanksText}>Спасибо! +{REVIEW_PIKS}</Text>
                <Pik size={16} />
              </Animated.View>
            ) : (
              <View style={{ gap: 4, marginTop: 8 }}>
                <Text style={s.ask}>Как вам книга?</Text>
                <View style={s.stars} accessibilityRole="adjustable" accessibilityLabel="Оценить книгу, за отзыв 50 пиков">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Tap key={n} onPress={() => rate(n)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${n} из 5`}>
                      <StarIcon size={24} color={colors.peachStrong} weight="fill" />
                    </Tap>
                  ))}
                </View>
              </View>
            )
          ) : null}
        </View>
      </View>

      {/* страницы книги — полоской; нажатие открывает листание на весь экран */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.stripBleed} contentContainerStyle={s.strip}>
        {m.pages.map((p, i) => (
          <Tap key={`${p}-${i}`} onPress={() => onView(i)} accessibilityRole="imagebutton" accessibilityLabel={`Страница ${i + 1} из ${m.pages.length}`}>
            <Image source={pic(p)} style={[s.thumb, i === 0 && s.thumbFirst]} contentFit="cover" transition={150} />
          </Tap>
        ))}
      </ScrollView>

      {/* одно главное действие по поводу плитки + поделиться */}
      <View style={s.actions}>
        <Tap style={s.share} onPress={onShare} accessibilityRole="button" accessibilityLabel={`Поделиться книгой «${m.title}»: другу скидка, вам пики`}>
          <ExportIcon size={20} color={colors.fg} weight="bold" />
        </Tap>
        {m.kind === 'yearAgo' ? (
          <Tap style={s.main} onPress={sequel} accessibilityRole="button">
            <Text style={s.mainText}>Собрать продолжение</Text>
          </Tap>
        ) : (
          <Tap style={[s.main, m.kind === 'arrived' && s.mainQuiet]} onPress={again} accessibilityRole="button" accessibilityLabel={`Заказать копию «${m.title}», ${rub(price)}`}>
            <Text style={[s.mainText, m.kind === 'arrived' && { color: colors.fg }]}>Заказать копию · {rub(price)}</Text>
          </Tap>
        )}
      </View>
    </View>
  );
}

/** Книга на весь экран: страницы листаются вбок, сверху название и «3 / 6», закрыть — крестиком. */
function PagesViewer({ m, start, onClose }: { m: Memory; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(start);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };
  return (
    <View style={s.viewer}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} contentOffset={{ x: start * width, y: 0 }}>
        {m.pages.map((p, i) => (
          <View key={`${p}-${i}`} style={{ width, height, justifyContent: 'center' }}>
            <Image source={pic(p)} style={{ width, height: width * 1.25 }} contentFit="cover" accessibilityLabel={`Страница ${i + 1} из ${m.pages.length}`} />
          </View>
        ))}
      </ScrollView>
      <View style={[s.viewerTop, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }}>
          <Text style={s.viewerTitle} numberOfLines={1}>{m.title}</Text>
          <Text style={s.viewerSub}>{page + 1} / {m.pages.length}</Text>
        </View>
        <Tap onPress={onClose} hitSlop={12} style={s.viewerClose} accessibilityRole="button" accessibilityLabel="Закрыть">
          <XIcon size={20} color="#fff" weight="bold" />
        </Tap>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 26, backgroundColor: colors.card, padding: 14, gap: 14 },
  top: { flexDirection: 'row' },
  text: { flex: 1, gap: 3 },
  title: { fontSize: 20, lineHeight: 25, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  meta: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  ask: { fontSize: 14, fontFamily: fonts.semibold, color: colors.fg },
  stars: { flexDirection: 'row', gap: 4 },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  thanksText: { fontSize: 15, fontFamily: fonts.bold, color: colors.tealInk },
  stripBleed: { marginHorizontal: -14 },
  strip: { paddingHorizontal: 14, gap: 6 },
  thumb: { width: 104, height: 128, borderRadius: 14, backgroundColor: colors.card2 },
  thumbFirst: { width: 168 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  viewerTitle: { fontSize: 17, fontFamily: fonts.bold, color: '#fff' },
  viewerSub: { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.75)', marginTop: 1, fontVariant: ['tabular-nums'] },
  viewerClose: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  share: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, height: 48, borderRadius: 24, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  mainQuiet: { backgroundColor: '#fff' },
  mainText: { fontSize: 15.5, fontFamily: fonts.semibold, color: '#fff' },
});
