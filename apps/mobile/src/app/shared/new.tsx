/**
 * Новый общий альбом: сначала узнаём всё, что нужно, — и только потом выдаём QR-код.
 * Название и повод, дата события, сколько дней собирать фото, проверка снимков и имена гостей.
 * В продукте — POST /shared-albums; здесь адрес собирается из названия.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBar } from '@/components/nav';
import { Tap } from '@/components/ui';
import { OCCASIONS } from '@/data/demo';
import { enterItem } from '@/motion';
import { colors, fonts } from '@/theme';

const WHEN = ['Сегодня', 'Завтра', 'Выбрать дату'];
const UNTIL = ['1 день', '3 дня', 'Неделя', 'Месяц'];

/** Короткий адрес из названия: латиница, без пробелов. */
function slug(name: string) {
  const map: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
  const s = name.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (s || 'album').slice(0, 24);
}

export default function NewShared() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('Выпускной');
  const [when, setWhen] = useState('Сегодня');
  const [until, setUntil] = useState('3 дня');
  const [moderate, setModerate] = useState(true);
  const [names, setNames] = useState(true);
  const ready = name.trim().length >= 2;

  const create = () => {
    if (!ready) return;
    router.replace({ pathname: '/shared/[id]', params: { id: slug(name), name: name.trim(), fresh: '1' } });
  };

  return (
    <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <NavBar title="Новый альбом" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">
        <Animated.View entering={enterItem(0)} style={s.group}>
          <Text style={s.label}>Название</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Свадьба Ани и Миши"
            placeholderTextColor={colors.mut2}
            style={s.input}
            autoFocus
            returnKeyType="done"
            accessibilityLabel="Название альбома"
          />
          <Text style={s.hint}>Гости увидят его, когда отсканируют код</Text>
        </Animated.View>

        <Animated.View entering={enterItem(1)} style={s.group}>
          <Text style={s.label}>Повод</Text>
          <Chips items={OCCASIONS} value={occasion} onChange={setOccasion} />
        </Animated.View>

        <Animated.View entering={enterItem(2)} style={s.group}>
          <Text style={s.label}>Когда событие</Text>
          <Chips items={WHEN} value={when} onChange={setWhen} />
          <Text style={[s.label, { marginTop: 8 }]}>Собирать фото после него</Text>
          <Chips items={UNTIL} value={until} onChange={setUntil} />
        </Animated.View>

        <Animated.View entering={enterItem(3)} style={[s.group, { paddingVertical: 6 }]}>
          <Toggle title="Проверять фото перед добавлением" sub="вы одобряете снимки, прежде чем их увидят все" value={moderate} onChange={setModerate} />
          <View style={s.divider} />
          <Toggle title="Спрашивать имя гостя" sub="чтобы знать, кто прислал фото" value={names} onChange={setNames} />
        </Animated.View>
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        <Tap style={[s.cta, !ready && s.ctaOff]} onPress={create} disabled={!ready} accessibilityRole="button" accessibilityState={{ disabled: !ready }}>
          <Text style={[s.ctaText, !ready && { color: colors.mut }]}>{ready ? 'Создать и получить QR-код' : 'Введите название альбома'}</Text>
        </Tap>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chips({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.chips} accessibilityRole="radiogroup">
      {items.map((it) => {
        const on = it === value;
        return (
          <Tap key={it} style={[s.chip, on && s.chipOn]} onPress={() => onChange(it)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{it}</Text>
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
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.coralAction, false: colors.card2 }}
        thumbColor="#fff"
        ios_backgroundColor={colors.card2}
        accessibilityLabel={title}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, gap: 10 },
  group: { backgroundColor: colors.card, borderRadius: 26, padding: 16, gap: 8 },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut },
  input: { fontSize: 20, lineHeight: 26, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg, paddingVertical: 4 },
  hint: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.fg },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  chipTextOn: { color: '#fff' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  tTitle: { fontSize: 15.5, fontFamily: fonts.semibold, color: colors.fg },
  tSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hair },
  bottom: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg },
  cta: { height: 54, borderRadius: 27, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: colors.card2 },
  ctaText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
});
