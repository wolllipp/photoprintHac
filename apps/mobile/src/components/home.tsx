/**
 * Блоки главной: шапка, поле ввода, «Собрали для вас», «Мои альбомы», сервисы, текущий заказ.
 * Порядок и правила — notes/11-design-decisions.md.
 */
import {
  AirplaneTiltIcon,
  BabyCarriageIcon,
  BookOpenTextIcon,
  CaretRightIcon,
  ChampagneIcon,
  ImagesIcon,
  MicrophoneIcon,
  QrCodeIcon,
  SparkleIcon,
  type IconProps,
} from 'phosphor-react-native';
import type { ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Photo, Pik, SectionHeader, SegmentBar, Tap } from '@/components/ui';
import { STAGES, type Album, type CurrentOrder, type Suggestion } from '@/data/demo';
import { colors, fonts, radius, themeTint, type AlbumTheme } from '@/theme';

/* ---------- шапка как в Яндекс Go: аватар · логотип по центру · пики ---------- */
export function TopBar({ initial, points }: { initial: string; points: number }) {
  return (
    <View style={s.topbar}>
      <Tap style={s.avatar} accessibilityRole="button" accessibilityLabel="Профиль">
        <Text style={s.avatarText}>{initial}</Text>
      </Tap>
      <Text style={s.brand} accessibilityRole="header">PicPac</Text>
      <Tap style={s.points} accessibilityRole="button" accessibilityLabel={`${points} пиков, пригласить друга`}>
        <Text style={s.pointsText}>{points}</Text>
        <Pik />
      </Tap>
    </View>
  );
}

/* ---------- одно поле, как «Куда едем?» ---------- */
export function AskField({ onPress, onMic }: { onPress?: () => void; onMic?: () => void }) {
  return (
    <Tap style={s.search} onPress={onPress} accessibilityRole="search" accessibilityLabel="Какую книгу соберём?">
      <BookOpenTextIcon size={22} color={colors.coralAction} weight="fill" />
      <Text style={s.placeholder}>Какую книгу соберём?</Text>
      <Tap style={s.mic} onPress={onMic} accessibilityRole="button" accessibilityLabel="Сказать голосом" hitSlop={6}>
        <MicrophoneIcon size={18} color={colors.coralAction} weight="fill" />
      </Tap>
    </Tap>
  );
}

/* ---------- «Собрали для вас»: ИИ-черновики ---------- */
export function Suggestions({ items, onOpen }: { items: Suggestion[]; onOpen?: (id: string) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title="Собрали для вас"
        action="Все"
        accessory={<SparkleIcon size={16} color={colors.coralAction} weight="fill" />}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sugRow} style={s.bleed}>
        {items.map((it) => (
          <Tap key={it.id} style={s.sug} onPress={() => onOpen?.(it.id)} accessibilityRole="button" accessibilityLabel={`${it.title}, ${it.meta}, ${it.tag}`}>
            <View style={s.cover}>
              <Photo k={it.cover[0]} style={{ flex: 1.4 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <Photo k={it.cover[1]} style={{ flex: 1 }} />
                <Photo k={it.cover[2]} style={{ flex: 1 }} />
              </View>
              <View style={[s.tag, it.tagTone === 'green' && { backgroundColor: '#E5F1E8' }]}>
                <Text style={[s.tagText, it.tagTone === 'green' && { color: '#2F6B45' }]}>{it.tag}</Text>
              </View>
            </View>
            <Text style={s.sugTitle} numberOfLines={1}>{it.title}</Text>
            <Text style={s.sugMeta} numberOfLines={1}>{it.meta}</Text>
          </Tap>
        ))}
      </ScrollView>
    </View>
  );
}

/* ---------- «Мои альбомы»: строки без карточки, иконка по теме ---------- */
const THEME_ICON: Record<AlbumTheme, ComponentType<IconProps>> = {
  travel: AirplaneTiltIcon,
  child: BabyCarriageIcon,
  wedding: ChampagneIcon,
  graduation: BookOpenTextIcon,
  newyear: SparkleIcon,
  love: SparkleIcon,
  family: ImagesIcon,
  default: ImagesIcon,
};

export function MyAlbums({ items }: { items: Album[] }) {
  return (
    <View style={{ gap: 2 }}>
      <SectionHeader title="Мои альбомы" />
      <View>
        {items.map((a, i) => {
          const Icon = THEME_ICON[a.theme];
          const tint = themeTint[a.theme];
          return (
            <Tap key={a.id} style={s.row} accessibilityRole="button" accessibilityLabel={`${a.title}, ${a.subtitle}`}>
              {i > 0 ? <View style={s.divider} /> : null}
              <View style={[s.ico, { backgroundColor: tint.bg }]}>
                <Icon size={20} color={tint.fg} weight="fill" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{a.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{a.subtitle}</Text>
              </View>
              <CaretRightIcon size={16} color={colors.mut2} weight="bold" />
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- фотопечать и общий альбом ---------- */
export function MiniServices() {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Tap style={s.svc} accessibilityRole="button">
        <ImagesIcon size={18} color="#4C5F95" weight="fill" />
        <Text style={s.svcText}>Фотопечать</Text>
      </Tap>
      <Tap style={s.svc} accessibilityRole="button">
        <QrCodeIcon size={18} color={colors.tealInk} weight="fill" />
        <Text style={s.svcText}>Общий альбом</Text>
      </Tap>
    </View>
  );
}

/* ---------- текущий заказ, как активная поездка ---------- */
export function OrderStrip({ order }: { order: CurrentOrder }) {
  return (
    <Tap style={s.order} accessibilityRole="button" accessibilityLabel={`${order.title}, ${order.when}`}>
      <View style={[s.ico, { width: 36, height: 36, backgroundColor: colors.coralTint }]}>
        <BookOpenTextIcon size={18} color={colors.coralAction} weight="fill" />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.orderTitle} numberOfLines={1}>{order.title}</Text>
        <SegmentBar total={STAGES.length} done={STAGES.indexOf(order.stage)} />
      </View>
      <Text style={s.when}>{order.when}</Text>
    </Tap>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '600', color: colors.fg },
  brand: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: fonts.logo, fontSize: 27, color: colors.coral, zIndex: -1 },
  points: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 11, paddingRight: 5,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(35,43,42,0.12)',
  },
  pointsText: { fontSize: 15, fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },

  search: {
    height: 58, borderRadius: radius.md, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingLeft: 16, paddingRight: 8,
    shadowColor: '#232B2A', shadowOpacity: 0.07, shadowRadius: 13, shadowOffset: { width: 0, height: 10 }, elevation: 3,
  },
  placeholder: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.mut, letterSpacing: -0.2 },
  mic: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.coralTint, alignItems: 'center', justifyContent: 'center' },

  bleed: { marginHorizontal: -18 },
  sugRow: { paddingHorizontal: 18, gap: 10 },
  sug: { width: 196, gap: 3 },
  cover: { height: 168, borderRadius: 20, overflow: 'hidden', flexDirection: 'row', gap: 3, marginBottom: 6 },
  tag: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)' },
  tagText: { fontSize: 12, fontWeight: '700', color: colors.coralLink },
  sugTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.15, color: colors.fg },
  sugMeta: { fontSize: 13, color: colors.mut },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { position: 'absolute', top: 0, left: 52, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.hair },
  ico: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', letterSpacing: -0.15, color: colors.fg },
  rowSub: { fontSize: 13, color: colors.mut, marginTop: 1 },

  svc: { flex: 1, height: 48, borderRadius: 16, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  svcText: { fontSize: 15, fontWeight: '600', color: colors.fg },

  order: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 10, paddingLeft: 10, paddingRight: 14 },
  orderTitle: { fontSize: 15, fontWeight: '600', color: colors.fg },
  when: { fontSize: 13, fontWeight: '600', color: colors.mut },
});
