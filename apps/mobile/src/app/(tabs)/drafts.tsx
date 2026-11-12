/**
 * «Черновики» вместо «Корзины» (стратегия трека 2, notes/25): книги, которые человек сам начал, но не заказал.
 * Идеи ИИ сюда не попадают — они в кружках на главной, пока их не открыли.
 * Сохраняются сами и ждут 60 дней. Нажатие — продолжить с того же места, «Заказать» — сразу на оформление.
 * Цена и срок видны на каждой карточке. Удалить — потянуть влево (с «Вернуть» на 5 секунд), как было в корзине.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SwipeDelete } from '@/components/swipeDelete';
import { Tap } from '@/components/ui';
import { bookPrice, drafts, fitFormat, fitPages, PRINT_DAYS, tariffs } from '@/data/demo';
import { pic, type Pic } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

/** Сколько дней храним незаконченную книгу (как на super.picpac.by). */
const KEEP_DAYS = 60;
const DAY = 86_400_000;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dayMonth = (t: number) => `${new Date(t).getDate()} ${MONTHS[new Date(t).getMonth()]}`;

type Item = {
  id: string;
  title: string;
  cover: Pic;
  /** что видно на обложке: «собрана ИИ» или «вы остановились здесь» */
  tag: string;
  pages: number;
  format: string;
  photos: number;
  savedAt: number;
  open: () => void;
};

/** Тариф по умолчанию — тот же, что на экране книги. */
const TARIFF = tariffs[1];

export default function Drafts() {
  const insets = useSafeAreaInsets();
  const { lastBook, started, hiddenDrafts, hideDraft, setLastBook, orderNow, serverDrafts } = useStore();

  // только то, что человек сам начал; свежие — сверху. Идеи ИИ живут в кружках на главной, сюда не попадают
  const items: Item[] = Object.entries(started)
    .filter(([id]) => !hiddenDrafts.includes(id) && (drafts[id] || serverDrafts[id]))
    .sort((a, b) => b[1] - a[1])
    .map(([id, at], i) => {
      // демо-книга — из данных; книга с сервера — из её карточки (открывается по id проекта и подгружается с сервера)
      const d = drafts[id] ?? serverDrafts[id];
      const server = !drafts[id];
      // на этой книге человек остановился — открываем на той же странице
      const fromPreview = lastBook && (lastBook.params.id ?? 'karelia') === id ? lastBook : null;
      return {
        id,
        title: fromPreview ? fromPreview.title : d.title,
        cover: fromPreview ? fromPreview.cover : d.cover,
        tag: i === 0 ? 'вы остановились здесь' : 'не закончена',
        pages: fromPreview ? Number(fromPreview.params.pages ?? d.pages) : d.pages,
        format: fromPreview ? fromPreview.params.format ?? d.format : d.format,
        photos: d.photos,
        savedAt: at,
        open: () =>
          router.push({
            pathname: '/review',
            params: fromPreview ? fromPreview.params : server ? { id, projectId: id, title: d.title, pages: String(d.pages), format: d.format } : { id },
          }),
      };
    });

  const order = (it: Item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const fmt = fitFormat(TARIFF.id, it.format);
    orderNow({
      projectId: it.id,
      title: it.title,
      tariff: TARIFF.id,
      tariffName: TARIFF.name,
      format: fmt,
      pages: fitPages(TARIFF.id, it.pages),
      finish: 'Глянец',
      price: bookPrice(TARIFF.id, fmt, it.pages, 'Глянец'),
      readyBy: TARIFF.readyBy,
      cover: it.cover,
    });
    router.push('/checkout');
  };

  // удаление свайпом: 5 секунд на «Вернуть», потом черновик уходит по-настоящему
  const [pending, setPending] = useState<string[]>([]);
  const remove = (it: Item) => setPending((p) => (p.includes(it.id) ? p : [...p, it.id]));
  const restore = (it: Item) => setPending((p) => p.filter((x) => x !== it.id));
  const expire = (it: Item) => {
    hideDraft(it.id);
    if (lastBook && (lastBook.params.id ?? 'karelia') === it.id) setLastBook(null);
    setPending((p) => p.filter((x) => x !== it.id));
  };
  const live = items.filter((it) => !pending.includes(it.id)).length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }]} showsVerticalScrollIndicator={false}>
      <View style={s.head}>
        <Text style={s.title}>Черновики</Text>
        {live ? <Text style={s.count}>{live}</Text> : null}
      </View>
      <Text style={s.lead}>Сохраняем сами и храним {KEEP_DAYS} дней. Откройте книгу, чтобы продолжить с того же места.</Text>

      {items.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Черновиков нет</Text>
          <Text style={s.lead}>Начатая книга появится здесь, даже если вас отвлекут на полпути.</Text>
          <Tap style={s.emptyBtn} onPress={() => router.navigate('/')} accessibilityRole="button">
            <PlusIcon size={18} color="#fff" weight="bold" />
            <Text style={s.emptyBtnText}>Новая книга</Text>
          </Tap>
        </View>
      ) : null}

      <View>
      {items.map((it, i) => {
        const fmt = fitFormat(TARIFF.id, it.format);
        const pages = fitPages(TARIFF.id, it.pages);
        const price = bookPrice(TARIFF.id, fmt, it.pages, 'Глянец');
        const until = it.savedAt + KEEP_DAYS * DAY;
        return (
          <Animated.View key={it.id} entering={enterItem(i)}>
            <SwipeDelete
              title={it.title}
              cover={it.cover}
              what="Удалено из черновиков"
              deleted={pending.includes(it.id)}
              onDelete={() => remove(it)}
              onRestore={() => restore(it)}
              onExpire={() => expire(it)}>
            <Tap
              style={s.card}
              onPress={it.open}
              accessibilityRole="button"
              accessibilityLabel={`${it.title}. ${TARIFF.name}, ${pages} страниц, ${rub(price)}. Храним до ${dayMonth(until)}. Нажмите, чтобы продолжить`}
              accessibilityActions={[{ name: 'delete', label: 'Удалить черновик' }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && remove(it)}>
              <View style={s.photo}>
                <Image source={pic(it.cover)} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
                <View style={[s.tag, i === 0 && s.tagNow]}>
                  <Text style={[s.tagText, i === 0 && { color: '#fff' }]}>{it.tag}</Text>
                </View>
                <View>
                  <Text style={s.cardTitle} numberOfLines={1}>{it.title}</Text>
                  <Text style={s.cardSub}>{it.photos} фото · храним до {dayMonth(until)}</Text>
                </View>
              </View>
              {/* цена и срок — всегда на виду; «Заказать» — сразу на оформление */}
              <View style={s.foot}>
                <View style={{ flex: 1 }}>
                  <Text style={s.price}>{rub(price)}</Text>
                  <Text style={s.meta} numberOfLines={1}>{TARIFF.name} · {fmt} · {pages} стр. · печать {PRINT_DAYS} дня</Text>
                </View>
                <Tap style={s.cta} onPress={() => order(it)} accessibilityRole="button" accessibilityLabel={`Заказать «${it.title}», ${rub(price)}`}>
                  <Text style={s.ctaText}>Заказать</Text>
                </Tap>
              </View>
            </Tap>
            </SwipeDelete>
          </Animated.View>
        );
      })}
      </View>
      {items.length ? <Text style={s.hint}>Потяните черновик влево, чтобы удалить</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  count: { fontSize: 22, fontFamily: fonts.display, color: colors.mut2 },
  title: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display, letterSpacing: -0.8, color: colors.fg },
  lead: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.mut, marginBottom: 4 },
  card: { borderRadius: 26, overflow: 'hidden', backgroundColor: colors.card },
  photo: { height: 170, padding: 14, justifyContent: 'space-between', overflow: 'hidden', backgroundColor: colors.card2 },
  tag: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  tagNow: { backgroundColor: colors.coralAction },
  tagText: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.fg },
  cardTitle: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.5, color: '#fff' },
  cardSub: { fontSize: 13.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  price: { fontSize: 18, lineHeight: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  meta: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut, marginTop: 2 },
  cta: { height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.coralAction, justifyContent: 'center' },
  ctaText: { fontSize: 15.5, fontFamily: fonts.semibold, color: '#fff' },
  hint: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut2, textAlign: 'center', marginTop: 2 },
  empty: { backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 6, alignItems: 'flex-start' },
  emptyTitle: { fontSize: 20, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: colors.coralAction, marginTop: 6 },
  emptyBtnText: { fontSize: 15.5, fontFamily: fonts.semibold, color: '#fff' },
});
