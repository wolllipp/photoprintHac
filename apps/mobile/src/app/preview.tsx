/**
 * Превью книги — что получится, до сборки. По референсу профиля: сверху сцена (книга на размытой
 * обложке, к низу уходит в белый), крупное название, кнопка «Собрать» с ценой и круглая «Править»,
 * строка цифр «Страниц · Фото · Цена», описание от ИИ, развороты сеткой.
 * Книга пока объёмная статичная (корешок, срез страниц, тень); «живая» 3D-книга — следующим шагом.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { CaretLeftIcon, PencilSimpleIcon, SparkleIcon } from 'phosphor-react-native';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Tap } from '@/components/ui';
import { spreads, tariffs, type PageLayout, type Spread } from '@/data/demo';
import { pic, type Pic } from '@/data/photos';
import { rub } from '@/data/store';
import { AnimatedNumber, ease } from '@/motion';
import { colors, fonts } from '@/theme';

export default function Preview() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const p = useLocalSearchParams<{ title?: string; pages?: string; photos?: string; about?: string }>();
  const title = p.title ?? 'Карелия, июль';
  const pages = Number(p.pages ?? 24);
  const picked = Math.round(pages * 1.6); // сколько кадров встанет в книгу
  const price = tariffs[1].price;
  const cover: Pic = spreads[0].photos[0] ?? 'city-sunset';
  const STAGE = Math.round(width * 1.05);

  const build = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/build');
  };

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        {/* сцена: размытая обложка как свет вокруг книги, к низу — в белый */}
        <View style={{ height: STAGE }}>
          <Image source={pic(cover)} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.18)' }]} />
          <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', '#fff']} locations={[0.55, 0.82, 1]} style={StyleSheet.absoluteFill} />
          <Animated.View entering={FadeIn.duration(500)} style={[s.bookWrap, { top: insets.top + 56 }]}>
            <Book cover={cover} title={title} w={Math.round(width * 0.56)} />
          </Animated.View>
        </View>

        <View style={s.body}>
          <Animated.Text entering={FadeInDown.duration(420).easing(ease.smoothOut)} style={s.title}>
            {title}
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(60).duration(420).easing(ease.smoothOut)} style={s.kind}>
            Фотокнига Classic 20×20
          </Animated.Text>

          <Animated.View entering={FadeInDown.delay(120).duration(420).easing(ease.smoothOut)} style={s.actions}>
            <Tap style={s.cta} onPress={build} accessibilityRole="button" accessibilityLabel={`Собрать книгу, ${rub(price)}`}>
              <Text style={s.ctaText}>Собрать книгу</Text>
            </Tap>
            <Tap style={s.edit} onPress={() => router.push({ pathname: '/editor', params: { id: 'karelia' } })} accessibilityRole="button" accessibilityLabel="Править">
              <PencilSimpleIcon size={20} color={colors.fg} weight="bold" />
            </Tap>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(180).duration(420).easing(ease.smoothOut)} style={s.stats}>
            <Stat value={<AnimatedNumber value={pages} format={String} style={s.statNum} />} label="страниц" />
            <Stat value={<AnimatedNumber value={picked} format={String} style={s.statNum} />} label="фото" />
            <Stat value={<Text style={s.statNum}>{rub(price).replace(' р.', '')}</Text>} label="рублей" />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(240).duration(420).easing(ease.smoothOut)} style={s.about}>
            <View style={s.aboutHead}>
              <View style={s.aiDot}>
                <SparkleIcon size={11} color="#fff" weight="fill" />
              </View>
              <Text style={s.aboutLabel}>Что получится</Text>
            </View>
            <Text style={s.aboutText}>
              {p.about ??
                `Тёплая книга о поездке: ${picked} лучших кадров из ${p.photos ?? 214}, без дублей и смазанных. Пейзажи — на целый разворот, люди — крупно, лица не попадут в обрез.`}
            </Text>
          </Animated.View>

          <Text style={s.h2}>Развороты</Text>
          <View style={s.grid}>
            {spreads.map((sp, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(300 + i * 60).duration(420).easing(ease.smoothOut)} style={s.cell}>
                <MiniSpread sp={sp} />
                <Text style={s.cellLabel}>{i === 0 ? 'Обложка и начало' : `Разворот ${i + 1}`}</Text>
              </Animated.View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* назад — стеклянная кнопка поверх сцены */}
      <Tap style={[s.back, { top: insets.top + 8 }]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Назад" hitSlop={8}>
        <CaretLeftIcon size={18} color={colors.fg} weight="bold" />
      </Tap>
    </View>
  );
}

/** Книга: обложка с фото и названием, корешок с тенью, срез страниц справа и снизу, мягкая тень на «столе». */
function Book({ cover, title, w }: { cover: Pic; title: string; w: number }) {
  const h = Math.round(w * 1.0);
  return (
    <View style={{ width: w + 10, height: h + 10 }}>
      {/* тень на столе */}
      <View style={[s.bookShadow, { width: w * 0.9, left: w * 0.08, top: h - 6 }]} />
      {/* срез страниц: несколько светлых слоёв со смещением */}
      {[6, 4, 2].map((o) => (
        <View key={o} style={[s.pages, { width: w, height: h, left: o + 2, top: o }]} />
      ))}
      {/* обложка */}
      <View style={[s.cover, { width: w, height: h }]}>
        <Image source={pic(cover)} style={StyleSheet.absoluteFill} contentFit="cover" />
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0.5, 1]} style={StyleSheet.absoluteFill} />
        {/* корешок: тень и блик у сгиба */}
        <LinearGradient
          colors={['rgba(0,0,0,0.38)', 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0)']}
          locations={[0, 0.035, 0.07, 0.14]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {/* лак: мягкий блик по диагонали */}
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
          locations={[0.25, 0.45, 0.65]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={s.coverTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
    </View>
  );
}

const count = (l: PageLayout) => (l === 'one' ? 1 : l === 'two' ? 2 : 3);
function MiniSpread({ sp }: { sp: Spread }) {
  const page = (layout: PageLayout, shots: Spread['photos']) => {
    const img = (k: Spread['photos'][number], flex = 1) =>
      k ? <Image key={String(k)} source={pic(k)} style={{ flex, borderRadius: 2 }} contentFit="cover" /> : <View style={{ flex, backgroundColor: colors.card2 }} />;
    return (
      <View style={s.miniPage}>
        {layout === 'one' ? img(shots[0]) : null}
        {layout === 'two' ? (
          <>
            {img(shots[0], 1.2)}
            {img(shots[1])}
          </>
        ) : null}
        {layout === 'three' ? (
          <>
            {img(shots[0], 1.4)}
            <View style={{ flex: 1, flexDirection: 'row', gap: 3 }}>
              {img(shots[1])}
              {img(shots[2])}
            </View>
          </>
        ) : null}
      </View>
    );
  };
  return (
    <View style={s.mini}>
      {page(sp.left, sp.photos.slice(0, count(sp.left)))}
      {page(sp.right, sp.photos.slice(count(sp.left)))}
    </View>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <View style={s.stat}>
      {value}
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bookWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bookShadow: { position: 'absolute', height: 26, borderRadius: 20, backgroundColor: 'rgba(40,25,15,0.28)', transform: [{ scaleY: 0.6 }], boxShadow: '0 0 24px 10px rgba(40,25,15,0.22)' },
  pages: { position: 'absolute', backgroundColor: '#FBF7F1', borderTopRightRadius: 6, borderBottomRightRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(60,40,30,0.12)' },
  cover: { position: 'absolute', left: 0, top: 0, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, overflow: 'hidden', backgroundColor: colors.card2 },
  coverTitle: { position: 'absolute', left: 18, right: 14, bottom: 14, fontSize: 20, lineHeight: 23, fontFamily: fonts.display, letterSpacing: -0.4, color: '#fff' },

  body: { paddingHorizontal: 16, marginTop: -36, gap: 14 },
  title: { fontSize: 34, lineHeight: 40, fontFamily: fonts.display, letterSpacing: -0.9, color: colors.fg, textAlign: 'center' },
  kind: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center', marginTop: -8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cta: { flex: 1, height: 56, borderRadius: 28, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  edit: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },

  stats: { flexDirection: 'row', paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 26, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg },
  statLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },

  about: { backgroundColor: colors.card, borderRadius: 22, padding: 14, gap: 8 },
  aboutHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  aboutLabel: { fontSize: 13, fontFamily: fonts.bold, color: colors.fg },
  aboutText: { fontSize: 15, lineHeight: 21, fontFamily: fonts.regular, color: colors.fg },

  h2: { fontSize: 22, fontFamily: fonts.display, letterSpacing: -0.3, color: colors.fg, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%', gap: 6 },
  mini: { aspectRatio: 2 / 1.05, flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, backgroundColor: '#FFFDF9', boxShadow: '0 6px 16px -10px rgba(60,40,30,0.4), 0 0 0 1px rgba(60,40,30,0.06)' },
  miniPage: { flex: 1, gap: 3 },
  cellLabel: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center' },

  back: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
});
