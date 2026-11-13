/**
 * Стикеры на страницах книги (наборы — data/stickerPacks.ts, Fluent Emoji, MIT).
 * Слоёв нет: стикер всегда поверх фото. С ним три действия — сдвинуть пальцем, «меньше / больше», убрать.
 * Плюс «Немного» из вопросов перед сборкой — тонкие уголки по краям страницы (Corners).
 */
import * as Haptics from 'expo-haptics';
import { MinusIcon, PlusIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { Tap } from '@/components/ui';
import { STICKER_PACKS, stickerXml } from '@/data/stickerPacks';
import { SHEET_TAIL, sheetIn, sheetOut } from '@/motion';
import { colors, fonts } from '@/theme';

/** Стикер на странице: id «набор/имя», центр (доли страницы), ширина (доля ширины страницы), наклон в градусах. */
export type Sticker = { id: string; x: number; y: number; s: number; r?: number };

export function StickerArt({ id, size }: { id: string; size: number }) {
  const xml = stickerXml(id);
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
}

/** Стикеры как картинка, без касаний (сетка порядка страниц, окно размеров). */
export function StaticStickers({ stickers, w, h }: { stickers?: Sticker[]; w: number; h: number }) {
  if (!stickers?.length) return null;
  return (
    <>
      {stickers.map((st, i) => {
        const size = st.s * w;
        return (
          <View key={i} pointerEvents="none" style={{ position: 'absolute', left: st.x * w - size / 2, top: st.y * h - size / 2, transform: [{ rotate: `${st.r ?? 0}deg` }] }}>
            <StickerArt id={st.id} size={size} />
          </View>
        );
      })}
    </>
  );
}

/**
 * Стикеры в ленте книги — их можно трогать: нажатие выделяет (и показывает «меньше / больше / убрать»),
 * тянуть — двигает. onChange — новый список стикеров страницы (сохраняется как правка, один шаг истории).
 */
export function StickerLayer({ stickers, w, h, selected, onSelect, onChange }: { stickers: Sticker[]; w: number; h: number; selected: number | null; onSelect: (i: number | null) => void; onChange: (next: Sticker[]) => void }) {
  return (
    <>
      {stickers.map((st, i) => (
        <OneSticker key={`${i}-${st.id}`} st={st} w={w} h={h} on={selected === i} onSelect={() => onSelect(i)} onMove={(x, y) => onChange(stickers.map((o, k) => (k === i ? { ...o, x, y } : o)))} />
      ))}
      {selected !== null && stickers[selected] ? (
        <StickerTools
          st={stickers[selected]}
          w={w}
          h={h}
          onSize={(k) => onChange(stickers.map((o, i) => (i === selected ? { ...o, s: Math.min(0.5, Math.max(0.07, o.s * k)) } : o)))}
          onRemove={() => {
            onSelect(null);
            onChange(stickers.filter((_, i) => i !== selected));
          }}
          onDone={() => onSelect(null)}
        />
      ) : null}
    </>
  );
}

function OneSticker({ st, w, h, on, onSelect, onMove }: { st: Sticker; w: number; h: number; on: boolean; onSelect: () => void; onMove: (x: number, y: number) => void }) {
  const size = st.s * w;
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const clamp = (v: number) => Math.min(0.97, Math.max(0.03, v));
  const done = (tx: number, ty: number) => {
    Haptics.selectionAsync().catch(() => {});
    onMove(clamp(st.x + tx / w), clamp(st.y + ty / h));
  };
  const pan = Gesture.Pan()
    .minDistance(4)
    .onStart(() => runOnJS(onSelect)())
    .onUpdate((e) => {
      dx.set(e.translationX);
      dy.set(e.translationY);
    })
    .onEnd((e) => runOnJS(done)(e.translationX, e.translationY))
    .onFinalize(() => {
      dx.set(0);
      dy.set(0);
    });
  const tap = Gesture.Tap().onEnd(() => runOnJS(onSelect)());
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }, { translateY: dy.get() }, { rotate: `${st.r ?? 0}deg` }] }));
  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View
        style={[{ position: 'absolute', left: st.x * w - size / 2, top: st.y * h - size / 2, width: size, height: size }, on && s.on, style]}
        accessibilityRole="button"
        accessibilityLabel="Стикер. Нажмите, чтобы изменить, или тяните, чтобы сдвинуть">
        <StickerArt id={st.id} size={size} />
      </Animated.View>
    </GestureDetector>
  );
}

/** «Меньше / больше / убрать / готово» — над выделенным стикером (или под ним, если он у верхнего края). */
function StickerTools({ st, w, h, onSize, onRemove, onDone }: { st: Sticker; w: number; h: number; onSize: (k: number) => void; onRemove: () => void; onDone: () => void }) {
  const size = st.s * w;
  const BAR_W = 168;
  const left = Math.min(w - BAR_W - 4, Math.max(4, st.x * w - BAR_W / 2));
  const above = st.y * h - size / 2 - 46;
  const top = above > 4 ? above : st.y * h + size / 2 + 6;
  return (
    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={[s.tools, { left, top, width: BAR_W }]}>
      <Tap style={s.tool} onPress={() => onSize(0.85)} accessibilityRole="button" accessibilityLabel="Меньше">
        <MinusIcon size={16} color={colors.fg} weight="bold" />
      </Tap>
      <Tap style={s.tool} onPress={() => onSize(1.18)} accessibilityRole="button" accessibilityLabel="Больше">
        <PlusIcon size={16} color={colors.fg} weight="bold" />
      </Tap>
      <Tap style={s.tool} onPress={onRemove} accessibilityRole="button" accessibilityLabel="Убрать стикер">
        <TrashIcon size={16} color={colors.coralAction} weight="bold" />
      </Tap>
      <Tap style={s.tool} onPress={onDone} accessibilityRole="button" accessibilityLabel="Готово">
        <XIcon size={14} color={colors.mut} weight="bold" />
      </Tap>
    </Animated.View>
  );
}

/** «Немного» украшений: тонкие уголки по краям страницы — цвет под фон. */
export function Corners({ w, h, dark }: { w: number; h: number; dark: boolean }) {
  const L = Math.max(10, w * 0.07);
  const inset = Math.max(4, w * 0.018);
  const c = dark ? 'rgba(255,255,255,0.55)' : 'rgba(29,33,32,0.45)';
  const line = { position: 'absolute' as const, backgroundColor: c };
  const corner = (key: string, x: 'left' | 'right', y: 'top' | 'bottom') => (
    <View key={key} pointerEvents="none" style={{ position: 'absolute', [x]: inset, [y]: inset, width: L, height: L }}>
      <View style={[line, { [y]: 0, [x]: 0, width: L, height: 1.2 }]} />
      <View style={[line, { [y]: 0, [x]: 0, width: 1.2, height: L }]} />
    </View>
  );
  return <>{[corner('tl', 'left', 'top'), corner('tr', 'right', 'top'), corner('bl', 'left', 'bottom'), corner('br', 'right', 'bottom')]}</>;
}

/** Добавить стикер: наборы вкладками, стикеры сеткой. Первым — набор, который ИИ выбрал для книги. */
export function StickerPicker({ first, bottom, onPick, onClose }: { first?: string; bottom: number; onPick: (id: string) => void; onClose: () => void }) {
  const packs = first ? [...STICKER_PACKS.filter((p) => p.id === first), ...STICKER_PACKS.filter((p) => p.id !== first)] : STICKER_PACKS;
  const [pack, setPack] = useState(packs[0].id);
  const cur = packs.find((p) => p.id === pack) ?? packs[0];
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, { bottom: -SHEET_TAIL, paddingBottom: bottom + 12 + SHEET_TAIL }]}>
        <View style={s.head}>
          <Text style={s.title}>Стикер на страницу</Text>
          <Tap style={s.close} onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть">
            <XIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.tabs}>
          {packs.map((p) => {
            const on = p.id === pack;
            return (
              <Tap key={p.id} style={[s.tab, on && s.tabOn]} onPress={() => setPack(p.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[s.tabText, on && { color: '#fff' }]}>{p.name}</Text>
              </Tap>
            );
          })}
        </ScrollView>
        <View style={s.grid}>
          {cur.items.map((it) => (
            <Tap
              key={it.id}
              style={s.cell}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onPick(it.id);
              }}
              accessibilityRole="button"
              accessibilityLabel="Добавить этот стикер">
              <StickerArt id={it.id} size={40} />
            </Tap>
          ))}
        </View>
        <Text style={s.note}>Стикер встанет на страницу, которую вы смотрите. Потом его можно сдвинуть пальцем.</Text>
      </Animated.View>
    </>
  );
}

const s = StyleSheet.create({
  on: { borderWidth: 1.5, borderColor: colors.coralAction, borderRadius: 8, borderStyle: 'dashed' },
  tools: { position: 'absolute', flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 20, padding: 4, boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 20 },
  tool: { width: 36, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  scrim: { backgroundColor: 'rgba(20,16,14,0.32)' },
  sheet: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 20, fontFamily: fonts.display, color: colors.fg },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  tabs: { gap: 6, paddingHorizontal: 16 },
  tab: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.card, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.fg },
  tabText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.fg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: 58, height: 58, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut },
});
