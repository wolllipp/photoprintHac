/**
 * Новый общий альбом. Сначала — для чего он, от этого зависит, когда собираем фото:
 *  • «Подарок к дате» (юбилей дедушки, день рождения мамы): фото собираем ЗАРАНЕЕ — до крайнего дня,
 *    чтобы книга успела напечататься и приехать к празднику. Показываем это шкалой: сбор → печать → доставка → праздник.
 *  • «Событие» (свадьба, выпускной): фото собираем ВО ВРЕМЯ и ПОСЛЕ — гости кидают снимки ещё несколько дней.
 * Потом — ссылка (и QR для события). В продукте — POST /shared-albums.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarHeartIcon, ConfettiIcon } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { PRINT_DAYS } from '@/data/demo';
import { dayMonth, daysWord } from '@/data/occasions';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

type Kind = 'gift' | 'event';
const DAY = 86_400_000;
/** Доставка Европочтой — до 3 дней; ещё день на то, чтобы собрать книгу из присланного. */
const DELIVERY_DAYS = 3;
const ASSEMBLE_DAYS = 1;

/** Когда праздник: быстрые варианты (дата-пикер — в продукте). */
const GIFT_WHEN = [
  { label: 'Через 2 недели', days: 14 },
  { label: 'Через 3 недели', days: 21 },
  { label: 'Через месяц', days: 30 },
];
const EVENT_WHEN = [
  { label: 'Сегодня', days: 0 },
  { label: 'Завтра', days: 1 },
  { label: 'Через неделю', days: 7 },
];
const EVENT_UNTIL = [
  { label: '3 дня', days: 3 },
  { label: 'Неделю', days: 7 },
  { label: 'Месяц', days: 30 },
];

/** Короткий адрес из названия: латиница, без пробелов. */
function slug(name: string) {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  const s = name.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (s || 'album').slice(0, 24);
}

export default function NewShared() {
  const insets = useSafeAreaInsets();
  const [now] = useState(() => new Date());
  const [kind, setKind] = useState<Kind>('gift');
  const [name, setName] = useState('');
  const [giftIn, setGiftIn] = useState(GIFT_WHEN[1].days);
  const [eventIn, setEventIn] = useState(EVENT_WHEN[0].days);
  const [until, setUntil] = useState(EVENT_UNTIL[1].days);
  const [moderate, setModerate] = useState(true);
  const [names, setNames] = useState(true);
  const ready = name.trim().length >= 2;

  const at = (days: number) => new Date(now.getTime() + days * DAY);
  // подарок: собираем до «праздник − доставка − печать − день на сборку»
  const party = at(giftIn);
  const collectTo = at(giftIn - DELIVERY_DAYS - PRINT_DAYS - ASSEMBLE_DAYS);
  const collectDays = giftIn - DELIVERY_DAYS - PRINT_DAYS - ASSEMBLE_DAYS;
  // событие: собираем с даты события ещё N дней
  const eventDay = at(eventIn);
  const eventTo = at(eventIn + until);

  const pick = <T,>(set: (v: T) => void, v: T) => {
    Haptics.selectionAsync().catch(() => {});
    set(v);
  };

  const create = () => {
    if (!ready) return;
    const status = kind === 'gift' ? `сбор фото до ${dayMonth(collectTo)} · подарок к ${dayMonth(party)}` : `сбор фото до ${dayMonth(eventTo)}`;
    router.replace({ pathname: '/shared/[id]', params: { id: slug(name), name: name.trim(), fresh: '1', kind, status } });
  };

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="Новый альбом" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        {/* для чего — от этого зависит, когда собираем фото */}
        <Animated.View entering={enterItem(0)} style={s.kinds} accessibilityRole="radiogroup">
          <KindCard
            on={kind === 'gift'}
            onPress={() => pick(setKind, 'gift')}
            icon={<CalendarHeartIcon size={22} color={kind === 'gift' ? '#fff' : colors.peachInk} weight="fill" />}
            title="Подарок к дате"
            sub="юбилей, день рождения — соберём фото заранее"
          />
          <KindCard
            on={kind === 'event'}
            onPress={() => pick(setKind, 'event')}
            icon={<ConfettiIcon size={22} color={kind === 'event' ? '#fff' : colors.peachInk} weight="fill" />}
            title="Событие"
            sub="свадьба, выпускной — гости кидают фото после"
          />
        </Animated.View>

        <Animated.View entering={enterItem(1)} style={s.group}>
          <Text style={s.label}>Название</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={kind === 'gift' ? 'Юбилей дедушки' : 'Свадьба Ани и Миши'}
            placeholderTextColor={colors.mut2}
            style={s.input}
            returnKeyType="done"
            accessibilityLabel="Название альбома"
          />
          <Text style={s.hint}>Его увидят все, кто откроет ссылку</Text>
        </Animated.View>

        {/* когда — и сразу наглядно, до какого дня собираем фото */}
        <Animated.View layout={LinearTransition.duration(240)} entering={enterItem(2)} style={s.group}>
          {kind === 'gift' ? (
            <Animated.View key="gift" entering={FadeIn.duration(200)} style={{ gap: 10 }}>
              <Text style={s.label}>Когда праздник</Text>
              <Chips items={GIFT_WHEN} value={giftIn} onChange={(v) => pick(setGiftIn, v)} />
              <Timeline
                steps={[
                  { title: 'Родные добавляют фото', when: `до ${dayMonth(collectTo)} · ${collectDays} ${daysWord(collectDays)}`, tone: 'coral' },
                  { title: 'Собираем и печатаем книгу', when: `${PRINT_DAYS + ASSEMBLE_DAYS} ${daysWord(PRINT_DAYS + ASSEMBLE_DAYS)}`, tone: 'peach' },
                  { title: 'Доставка', when: `до ${DELIVERY_DAYS} дней`, tone: 'peach' },
                  { title: 'Праздник — книга уже у вас', when: dayMonth(party), tone: 'teal' },
                ]}
              />
              <Text style={s.hint}>Родные добавляют фото до {dayMonth(collectTo)} — тогда книга точно успеет к {dayMonth(party)}.</Text>
            </Animated.View>
          ) : (
            <Animated.View key="event" entering={FadeIn.duration(200)} style={{ gap: 10 }}>
              <Text style={s.label}>Когда событие</Text>
              <Chips items={EVENT_WHEN} value={eventIn} onChange={(v) => pick(setEventIn, v)} />
              <Text style={[s.label, { marginTop: 4 }]}>Сколько собирать фото после</Text>
              <Chips items={EVENT_UNTIL} value={until} onChange={(v) => pick(setUntil, v)} />
              <Timeline
                steps={[
                  { title: 'Событие', when: dayMonth(eventDay), tone: 'ink' },
                  { title: 'Гости добавляют фото', when: `до ${dayMonth(eventTo)}`, tone: 'coral' },
                  { title: 'Собираем книгу из всех фото', when: 'вы смотрите и заказываете', tone: 'teal' },
                ]}
              />
              <Text style={s.hint}>Для праздника рядом покажем ещё и QR-код — гости отсканируют его с телефона.</Text>
            </Animated.View>
          )}
        </Animated.View>

        <Animated.View entering={enterItem(3)} style={[s.group, { paddingVertical: 6 }]}>
          <Toggle title="Проверять фото перед добавлением" sub="вы одобряете снимки, прежде чем их увидят все" value={moderate} onChange={setModerate} />
          <View style={s.divider} />
          <Toggle title="Спрашивать имя" sub="чтобы знать, кто прислал фото" value={names} onChange={setNames} />
        </Animated.View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={[s.cta, !ready && s.ctaOff]} onPress={create} disabled={!ready} accessibilityRole="button" accessibilityState={{ disabled: !ready }}>
          <Text style={[s.ctaText, !ready && { color: colors.mut }]}>{ready ? 'Создать и получить ссылку' : 'Введите название альбома'}</Text>
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}

function KindCard({ on, onPress, icon, title, sub }: { on: boolean; onPress: () => void; icon: ReactNode; title: string; sub: string }) {
  return (
    <Tap style={[s.kind, on && s.kindOn]} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${title}: ${sub}`}>
      <View style={[s.kindIcon, on && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>{icon}</View>
      <Text style={[s.kindTitle, on && { color: '#fff' }]}>{title}</Text>
      <Text style={[s.kindSub, on && { color: 'rgba(255,255,255,0.88)' }]}>{sub}</Text>
    </Tap>
  );
}

type Step = { title: string; when: string; tone: 'coral' | 'peach' | 'teal' | 'ink' };

/**
 * Шкала сверху вниз: точка, что происходит слева, когда — справа, между точками линия.
 * Вертикально, чтобы подписи не сжимались и не съезжали на узком экране.
 */
function Timeline({ steps }: { steps: Step[] }) {
  const tone = { coral: colors.coralAction, peach: colors.peachStrong, teal: colors.tealInk, ink: colors.fg };
  return (
    <View style={s.tl} accessible accessibilityLabel={steps.map((x) => `${x.title}: ${x.when}`).join(', ')}>
      {steps.map((x, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={x.title} style={s.tlRow}>
            <View style={s.tlRail}>
              <View style={[s.tlDot, { backgroundColor: tone[x.tone] }]} />
              {last ? null : <View style={[s.tlLine, { backgroundColor: x.tone === 'coral' ? colors.coralAction : colors.card2 }]} />}
            </View>
            <View style={[s.tlBody, !last && { paddingBottom: 12 }]}>
              <Text style={[s.tlTitle, x.tone === 'coral' && { color: colors.coralAction }, x.tone === 'teal' && { color: colors.tealInk }]}>{x.title}</Text>
              <Text style={s.tlWhen}>{x.when}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Chips<T extends number>({ items, value, onChange }: { items: { label: string; days: T }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.chips} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it.days === value;
        return (
          <Tap key={it.label} style={[s.chip, on && s.chipOn]} onPress={() => onChange(it.days)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{it.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

function Toggle({ title, sub, value, onChange }: { title: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={s.tTitle}>{title}</Text>
        <Text style={s.tSub}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.coralAction, false: colors.card2 }} thumbColor="#fff" ios_backgroundColor={colors.card2} accessibilityLabel={title} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  kinds: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, backgroundColor: colors.card, borderRadius: 24, padding: 14, gap: 6 },
  kindOn: { backgroundColor: colors.coralAction },
  kindIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  kindTitle: { fontSize: 16.5, fontFamily: fonts.bold, color: colors.fg },
  kindSub: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut, minHeight: 51 },
  group: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 8 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  input: { fontSize: 20, lineHeight: 26, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingVertical: 4 },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, color: colors.mut },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.fg },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  chipTextOn: { color: '#fff' },
  tl: { backgroundColor: colors.bg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginTop: 2 },
  tlRow: { flexDirection: 'row', gap: 12 },
  tlRail: { width: 12, alignItems: 'center' },
  tlDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  tlLine: { flex: 1, width: 2, borderRadius: 1, marginVertical: 3 },
  tlBody: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  tlTitle: { flexShrink: 1, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.semibold, color: colors.fg },
  tlWhen: { fontSize: 13.5, lineHeight: 20, fontFamily: fonts.medium, color: colors.mut, textAlign: 'right', fontVariant: ['tabular-nums'] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  tTitle: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  tSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hair },
  bottom: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: colors.card2 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
