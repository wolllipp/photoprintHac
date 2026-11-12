/**
 * Главная: сверху ряд кружков (плюс «Создать» и готовые подборки, как истории), ниже —
 * «Продолжить книгу» и статус заказа. Незаконченные книги живут в разделе «Черновики», а не здесь. Полноэкранного приветствия больше нет:
 * подборки открываются на весь экран по нажатию на кружок (components/picks.tsx).
 * Правила: стекло только поверх фото; коралловый — только главное действие; белая основа, персиковый — акцент.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CaretRightIcon, PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { Easing, FadeInDown } from 'react-native-reanimated';

import { BlurView } from 'expo-blur';

import { MaskedView } from '@/components/glass';
import { Logo } from '@/components/logo';
import { StageRing } from '@/components/stageRing';
import { Pik, Tap } from '@/components/ui';
import { useStore, type PlacedOrder } from '@/data/store';
import type { Suggestion } from '@/data/demo';
import { pic } from '@/data/photos';
import { AnimatedNumber } from '@/motion';
import { colors, fonts } from '@/theme';

/** Фото главной — как есть, без фильтров. */
function Photo({ source, style, transition }: { source: number; style?: StyleProp<ViewStyle>; transition?: number }) {
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={transition} />
    </View>
  );
}

/**
 * «Наплыв»: строки заглавными заходят друг на друга, нижняя лежит поверх,
 * а каждая верхняя к своему верху тает в прозрачность (градиент по маске текста).
 */
function splitLines(text: string): string[] {
  const words = text.toUpperCase().split(' ');
  if (words.length < 2) return [text.toUpperCase()];
  // делим на две строки, ближе к середине по числу букв
  let best = 1,
    diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < diff) {
      diff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/**
 * rgb — цвет букв «r,g,b»: белый на фото, тёмный на светлом фоне.
 * warm — коралловый наплыв: верхняя строка тает книзу в персиковый, нижняя — сплошным коралловым поверх.
 * enter — строки мягко поднимаются по очереди при появлении.
 * maxWidth — если строка на этом телефоне шире, заголовок сам уменьшается (замер после отрисовки).
 */
export function OverlapTitle({
  text,
  size: wanted,
  rgb = '255,255,255',
  warm,
  enter,
  maxWidth,
}: {
  text: string;
  size: number;
  rgb?: string;
  warm?: boolean;
  enter?: boolean;
  maxWidth?: number;
}) {
  const [fit, setFit] = useState<number | null>(null);
  const size = fit ?? wanted;
  const lines = splitLines(text);
  const lh = Math.round(size * 0.8); // строки наезжают
  // запас по краям: из-за отрицательного интервала последняя буква шире своей строки, а маска на iOS режет по строке
  const line = {
    fontSize: size,
    lineHeight: Math.round(size * 1.08),
    fontFamily: fonts.overlap,
    letterSpacing: -size * 0.04,
    color: '#000',
    textAlign: 'center',
    paddingHorizontal: Math.round(size * 0.1),
  } as const;
  // ширина строки на самом деле: если не влезает — уменьшаем кегль пропорционально (один раз)
  const measure = (w: number) => {
    if (!maxWidth || fit !== null) return;
    setFit(w <= maxWidth ? wanted : Math.floor((wanted * maxWidth) / w));
  };
  const top = warm ? (['rgba(204,96,91,1)', 'rgba(208,108,98,0.9)', 'rgba(220,140,124,0.62)'] as const) : ([`rgb(${rgb})`, `rgba(${rgb},0.12)`] as const);
  const topAt = warm ? ([0.15, 0.6, 1] as const) : ([0.25, 0.9] as const);
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
  return (
    <View accessibilityRole="header" accessibilityLabel={text} style={{ alignItems: 'center' }}>
      {/* невидимый замер: строка в своей естественной ширине, без переноса */}
      {maxWidth && fit === null ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 4000,
            opacity: 0,
          }}
          pointerEvents="none"
        >
          <Text style={[line, { alignSelf: 'flex-start' }]} onLayout={(e) => measure(e.nativeEvent.layout.width)}>
            {longest}
          </Text>
        </View>
      ) : null}
      {/* пока не замерили — не рисуем, чтобы не мелькнул слишком крупный заголовок */}
      {maxWidth && fit === null
        ? null
        : lines.map((l, i) => {
            const last = i === lines.length - 1;
            const style = {
              height: Math.round(size * 1.08),
              marginTop: i === 0 ? 0 : lh - Math.round(size * 1.08),
            };
            const entering = enter
              ? FadeInDown.delay(i * 110)
                  .duration(520)
                  .easing(Easing.out(Easing.cubic))
              : undefined;
            if (Platform.OS === 'web' || last) {
              // нижняя строка — сплошная (поверх верхней); в браузере маски нет — верхняя просто полупрозрачная
              return (
                <Reanimated.View key={i} entering={entering} style={{ zIndex: last ? 2 : 1 }}>
                  <Text
                    style={[
                      line,
                      style,
                      {
                        color: last ? (warm ? colors.coralAction : `rgb(${rgb})`) : warm ? 'rgba(214,122,108,0.9)' : `rgba(${rgb},0.6)`,
                      },
                    ]}
                  >
                    {l}
                  </Text>
                </Reanimated.View>
              );
            }
            return (
              <Reanimated.View key={i} entering={entering} style={{ zIndex: 1 }}>
                <MaskedView style={style} maskElement={<Text style={line}>{l}</Text>}>
                  {/* невидимая копия задаёт маске ширину, иначе она схлопывается в ноль */}
                  <Text style={[line, { opacity: 0 }]}>{l}</Text>
                  <LinearGradient colors={top} locations={topAt} style={StyleSheet.absoluteFill} />
                </MaskedView>
                {/* нижняя часть верхней строки не только бледнеет, но и расплывается под нижней */}
                {warm ? (
                  <MaskedView
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    maskElement={<LinearGradient colors={['transparent', 'black']} locations={[0.35, 0.9]} style={StyleSheet.absoluteFill} />}
                  >
                    <BlurView intensity={16} tint="default" style={StyleSheet.absoluteFill} />
                  </MaskedView>
                ) : null}
              </Reanimated.View>
            );
          })}
    </View>
  );
}

/* ====================================================================== */
/*  Шапка: аватар · логотип · пики                                         */
/* ====================================================================== */

/** points — null у гостя: пиков без входа нет, плашку не показываем. */
export function PlainTopBar({ points }: { points: number | null }) {
  return (
    <View style={s.plainTop}>
      {/* логотип — под кнопками и не ловит касания */}
      <View style={[s.brand, { pointerEvents: 'none' }]} accessibilityRole="header">
        <Logo width={92} color={colors.coral} />
      </View>
      <Tap onPress={() => router.navigate('/settings')} hitSlop={8} style={s.plainAvatar} accessibilityRole="button" accessibilityLabel="Профиль и настройки">
        <Text style={s.plainAvatarText}>И</Text>
      </Tap>
      {points != null ? (
        <Tap style={s.plainPoints} onPress={() => router.push('/points')} accessibilityRole="button" accessibilityLabel={`${points} пиков, подробнее`}>
          <AnimatedNumber value={points} format={String} style={[s.pointsText, { color: colors.fg }]} />
          <Pik />
        </Tap>
      ) : null}
    </View>
  );
}

/* ====================================================================== */
/*  Кружки сверху: плюс и подборки, как истории                            */
/* ====================================================================== */

const RING = 72;

/**
 * Первый кружок — плюс «Создать». Дальше — книги, которые уже собраны из фото:
 * коралловое кольцо — ещё не смотрели, серое — смотрели. Нажатие открывает подборку на весь экран.
 */
export function StoryRow({ items, seen, onNew, onOpen }: { items: Suggestion[]; seen: string[]; onNew: () => void; onOpen: (index: number) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.rowBleed} contentContainerStyle={s.row}>
        <Tap style={s.ringItem} onPress={onNew} accessibilityRole="button" accessibilityLabel="Создать: книгу, печать фото или общий альбом">
          <View style={[s.ring, s.ringNew]}>
            <PlusIcon size={28} color="#fff" weight="bold" />
          </View>
          <Text style={[s.ringLabel, { color: colors.fg, fontFamily: fonts.semibold }]} numberOfLines={1}>
            Создать
          </Text>
        </Tap>
        {items.map((it, i) => {
          const old = seen.includes(it.id);
          return (
            <Tap
              key={it.id}
              style={s.ringItem}
              onPress={() => onOpen(i)}
              accessibilityRole="button"
              accessibilityLabel={`Идея книги: ${it.title}, ${it.meta}${old ? ', просмотрено' : ''}`}
            >
              {/* пунктирное кольцо — «набросок», а не готовая книга */}
              <View style={[s.ring, s.ringIdea, old && { borderColor: colors.card2 }]}>
                <Photo source={pic(it.photo)} style={s.ringPhoto} />
              </View>
              <Text style={[s.ringLabel, old && { color: colors.mut }]} numberOfLines={1}>
                {it.title}
              </Text>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ====================================================================== */
/*  Плитки-действия                                                        */
/* ====================================================================== */

/**
 * «Сейчас»: брошенная книга и заказ в работе — две отдельные плитки (действие и статус — разные вещи),
 * но одного вида: обложка · две строки текста · стрелка, без кнопок и цветных плашек — глаз не прыгает.
 * Нет ни того, ни другого — плиток нет.
 */
export function NowBlock() {
  const { lastBook, orders } = useStore();
  const o = orders.find((x) => x.stage < 4) ?? orders.find((x) => x.stage === 4 && x.fresh);
  if (!lastBook && !o) return null;
  return (
    <Reanimated.View entering={FadeInDown.duration(380)} style={{ gap: 8 }}>
      {/* брошенная книга — фото на всю плитку, как в «Черновиках»: это приглашение вернуться, а не строка статуса */}
      {lastBook ? (
        <Tap style={s.resume} onPress={() => router.push({ pathname: '/review', params: lastBook.params })} accessibilityRole="button" accessibilityLabel={`Продолжить книгу «${lastBook.title}» с того же места`}>
          <Photo source={pic(lastBook.cover)} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.62)']} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />
          <View style={s.resumeTag}>
            <Text style={s.resumeTagText}>Продолжить книгу</Text>
          </View>
          <View style={s.resumeFoot}>
            <View style={{ flex: 1 }}>
              <Text style={s.resumeTitle} numberOfLines={1}>
                {lastBook.title}
              </Text>
              <Text style={s.resumeSub} numberOfLines={1}>
                собрана · откроем там, где вы остановились
              </Text>
            </View>
          </View>
        </Tap>
      ) : null}
      {o ? (
        <View style={{ gap: 8, marginTop: lastBook ? 8 : 0 }}>
          <Text style={s.caption}>Ближайший заказ</Text>
          <OrderStatus order={o} />
        </View>
      ) : null}
    </Reanimated.View>
  );
}

/**
 * Ближайший заказ на главной: слева кольцо этапа — то же, что во вкладке «Заказы» (и не похоже на даты «Скоро»),
 * справа одна фраза, когда будет, и что/где. Готов — бирюзовое кольцо с галочкой и «Можно забирать».
 * Подробности (этапы) — во вкладке «Заказы».
 */
function OrderStatus({ order }: { order: PlacedOrder }) {
  const ready = order.stage >= 4;
  const place = order.live.split(' · ').pop()?.split(',')[0] ?? '';
  const head = ready ? 'Можно забирать' : order.stage >= 3 ? `Приедет ${order.readyBy}` : `Будет ${order.readyBy}`;
  const doing = ['принят', 'проверяем макет', 'печатаем'][order.stage];
  const sub = ready || order.stage >= 3 ? `«${order.title}» · ${place}` : `«${order.title}» · ${doing}`;
  return (
    <Tap style={[s.now, s.orderRow]} onPress={() => router.navigate('/orders')} accessibilityRole="button" accessibilityLabel={`Заказ: ${head}. ${sub}`}>
      <StageRing stage={order.stage} size={46} />
      <View style={{ flex: 1 }}>
        <Text style={[s.nowTitle, ready && { color: colors.tealInk }]} numberOfLines={1}>
          {head}
        </Text>
        <Text style={s.nowSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <CaretRightIcon size={15} color={colors.mut2} weight="bold" />
    </Tap>
  );
}

const s = StyleSheet.create({
  plainTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  // профиль — в той же рамке, что пики справа: без тени и заливки, шапка читается одной линией
  plainAvatar: {
    width: 44,
    height: 44,
    borderRadius: 15,
    zIndex: 2,
    borderWidth: 1,
    borderColor: 'rgba(35,43,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainAvatarText: {
    fontSize: 18,
    fontFamily: fonts.display,
    color: colors.fg,
  },
  plainPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(35,43,42,0.12)',
  },
  brand: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: -1,
  },
  pointsText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },

  /* кружки */
  rowBleed: { marginHorizontal: -16 },
  row: { paddingHorizontal: 16, gap: 12 },
  ringItem: { width: RING + 6, alignItems: 'center', gap: 6 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNew: { backgroundColor: colors.coralAction },
  ringPhoto: {
    width: RING - 12,
    height: RING - 12,
    borderRadius: (RING - 12) / 2,
  },
  ringIdea: {
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: colors.coral,
  },
  ringLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.fg,
    maxWidth: RING + 6,
    textAlign: 'center',
  },

  /* «Сейчас» */
  now: {
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 12,
  },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  caption: { fontSize: 15, fontFamily: fonts.semibold, color: colors.mut, paddingHorizontal: 4 },
  resume: { height: 150, borderRadius: 24, overflow: 'hidden', padding: 14, justifyContent: 'space-between', backgroundColor: colors.card2 },
  resumeTag: { alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: colors.coralAction, justifyContent: 'center' },
  resumeTagText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },
  resumeFoot: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  resumeTitle: { fontSize: 22, lineHeight: 27, fontFamily: fonts.display, letterSpacing: -0.4, color: '#fff' },
  resumeSub: { fontSize: 13, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  nowTitle: {
    fontSize: 15.5,
    lineHeight: 20,
    fontFamily: fonts.bold,
    color: colors.fg,
  },
  nowSub: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: fonts.regular,
    color: colors.mut,
  },

  /* плитки */
  tile: {
    borderRadius: 26,
    backgroundColor: colors.card,
    padding: 16,
    overflow: 'hidden',
  },
  tSub: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.mut,
    marginTop: 3,
  },
  chipText: { fontSize: 12.5, fontFamily: fonts.semibold, color: '#fff' },
});
