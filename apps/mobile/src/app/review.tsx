/**
 * Просмотр книги — сразу после сборки, из идеи в кружке и из черновика.
 * Страницы просто листаются сверху вниз — оценивать каждую не нужно, это долго.
 * Нажали на фото — меню: заменить своим из галереи, убрать, раскладка страницы 1–4 фото — сразу, с «Отменить»;
 * или «ИИ: исправить или улучшить»: точка встаёт туда, куда нажали, рядом — что сделать словами, голосом или готовым
 * вариантом (поправить страницу или улучшить фото: свет, горизонт, чёткость…)
 * (как комментарии на макете). «Исправить N мест» — ИИ меняет только отмеченные страницы.
 * Цена, срок и «Заказать» всегда внизу; в конце — итог и выбор тарифа.
 * Место запоминается: из «Черновиков» открываемся на той же странице.
 * Что человек просил поменять — копится во «вкус» (notes/25, раздел 9) и учитывается в следующей книге.
 */
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChatCircleTextIcon, CheckIcon, HandTapIcon, ImagesIcon, MicrophoneIcon, MinusCircleIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EditorGuide } from '@/components/editorGuide';
import { VoiceGlow } from '@/components/voiceGlow';
import { Tap } from '@/components/ui';
import { bookPrice, BOOK, drafts, fitFormat, fitPages, PRINT_DAYS, spreads, tariffs, type PageLayout, type Tariff } from '@/data/demo';
import { captionLayout, captionPlaces, isSpread, LAYOUTS, layoutOf, slotAt, type CaptionAt, type LayoutDef, type Rect } from '@/data/layouts';
import { pic, type Pic, type PhotoName } from '@/data/photos';
import { rub, useStore } from '@/data/store';
import { SHEET_TAIL, sheetIn, sheetOut, ThinkingLine } from '@/motion';
import { colors, fonts } from '@/theme';

/**
 * Страница: макет из библиотеки (data/layouts.ts) и фото по его местам. Фото — демо-кадр или снимок из галереи.
 * fx — что ИИ сделал с фото: номер места → улучшения (свет и цвет, кадр по лицам, чёткость).
 */
type Fx = 'light' | 'crop' | 'sharp' | 'horizon' | 'warm' | 'bg' | 'restore' | 'bw';
type Page = { layout: string; photos: Pic[]; fx?: Record<number, Fx[]>; caption?: string };
const slotsOf = (id: string) => layoutOf(id).slots.length;
/** Самый простой макет на n фото — когда фото убрали. */
const SIMPLE: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four' };
/** Демо-развороты знают только «одно / два / три» — переводим в макеты библиотеки. */
const FROM_DEMO: Record<PageLayout, string> = { one: 'one', two: 'two', three: 'three' };
/** Замечание: страница, место на ней (доли ширины и высоты), что не так; fixed — ИИ уже поправил. */
type Pin = { id: number; page: number; x: number; y: number; text: string; fixed: boolean };

const PEOPLE: Pic[] = ['friends-selfie', 'friends-night', 'birthday-cake'];
const POOL: PhotoName[] = ['city-sunset', 'night-window', 'roses', 'bouquet', 'cafe-interior', 'cafe-dessert', 'concert', 'friends-night', 'friends-selfie', 'birthday-cake'];
const count = (l: PageLayout) => (l === 'one' ? 1 : l === 'two' ? 2 : 3);
/** Быстрые варианты под полем — чтобы не печатать. */
const QUICK = ['Заменить фото', 'Сделать крупнее', 'Убрать фото', 'Убрать селфи', 'Больше пейзажей', 'Меньше людей', 'Другое фото этого дня', 'Четыре фото на странице'];
/** Что «услышала» диктовка в демо (в продукте — распознавание речи в локальном контуре). */
const HEARD = 'Убери это фото, лучше пейзаж';
const GAP = 22;

/** Страницы книги из демо-разворотов: левая и правая страница каждого разворота по очереди. */
function makePages(n: number): Page[] {
  const flat: Page[] = spreads.flatMap((sp) => [
    { layout: FROM_DEMO[sp.left], photos: sp.photos.slice(0, count(sp.left)) as Pic[] },
    { layout: FROM_DEMO[sp.right], photos: sp.photos.slice(count(sp.left)) as Pic[] },
  ]);
  return Array.from({ length: n }, (_, i) => flat[i % flat.length]);
}

/** Как ИИ правит страницу по замечаниям: крупнее, убрать или заменить кадры (без людей, если просили). */
function fix(p: Page, notes: string[], seed: number): Page {
  const all = notes.join(' ');
  if (/крупн|больше/i.test(all)) return { layout: 'one', photos: [p.photos[0]] };
  if (/четыре|4 фото/i.test(all)) return withLayout(p, 'four');
  if (/убер|убра|лишн/i.test(all) && !/селф|люд/i.test(all) && slotsOf(p.layout) > 1) {
    const left = p.photos.slice(0, slotsOf(p.layout) - 1);
    return { layout: SIMPLE[left.length], photos: left };
  }
  const noPeople = /селф|люд|лиц/i.test(all);
  const pool = POOL.filter((k) => !p.photos.includes(k) && (!noPeople || !PEOPLE.includes(k)));
  return { ...p, photos: p.photos.map((_, i) => pool[(seed + i) % pool.length]) };
}

/** Сменить макет: лишние фото уходят, недостающие — добираем из того же дня; улучшения ИИ остаются у своих фото. */
function withLayout(p: Page, layout: string, keep = 0): Page {
  const n = slotsOf(layout);
  // фото, на которое нажали, идёт первым: выбрали «одно крупное» — останется именно оно
  const order = [p.photos[keep], ...p.photos.filter((_, i) => i !== keep)].filter((x): x is Pic => !!x);
  const extra = POOL.filter((k) => !order.includes(k));
  const fx = p.fx?.[keep] ? { 0: p.fx[keep] } : undefined;
  return { ...p, layout, photos: [...order.slice(0, n), ...extra].slice(0, n), fx: keep ? fx : p.fx };
}

export default function Review() {
  const params = useLocalSearchParams<Record<string, string>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { orderNow, setLastBook, startDraft, gesturesSeen, setGesturesSeen, addTaste } = useStore();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const nextPin = useRef(1);

  const id = params.id ?? 'karelia';
  const d = drafts[id];
  const title = params.title ?? d?.title ?? 'Новая книга';
  const format = params.format ?? d?.format ?? '20×20';
  const total = Math.max(2, Number(params.pages ?? d?.pages ?? 24));
  const [tariff, setTariff] = useState<Tariff['id']>((params.tariff as Tariff['id']) ?? 'lite');
  const pagesN = fitPages(tariff, total);
  // правки поверх собранной ИИ книги: номер страницы → новая страница
  const [edits, setEdits] = useState<Record<number, Page>>({});
  const pages = useMemo(() => makePages(pagesN).map((x, k) => edits[k] ?? x), [pagesN, edits]);
  const [pins, setPins] = useState<Pin[]>([]);
  // точка, к которой сейчас пишут замечание (новая или уже стоящая)
  const [draft, setDraft] = useState<Pin | null>(null);
  // нажали на фото — меню: заменить из галереи, убрать, раскладка 1–4, комментарий
  const [menu, setMenu] = useState<{ page: number; slot: number; x: number; y: number } | null>(null);
  // последняя прямая правка — можно отменить
  const [undo, setUndo] = useState<{ page: number; prev: Page | undefined; what: string } | null>(null);
  const [fixing, setFixing] = useState(false);
  const [at, setAt] = useState(() => Number(params.start ?? 0));
  const [hint, setHint] = useState(!gesturesSeen);
  // свежая книга (не продолжение черновика) — показываем, что вкус учтён

  const t = tariffs.find((x) => x.id === tariff) ?? tariffs[0];
  const fmt = fitFormat(tariff, format);
  const price = bookPrice(tariff, fmt, pagesN, 'Глянец');
  const open = pins.filter((p) => !p.fixed);

  // размер страницы: на всю ширину, 20×20 — квадрат, 21×30 — вертикальная
  const pageW = width - 32;
  const pageH = fmt === '21×30' ? pageW / 0.7 : pageW;
  const step = pageH + GAP + 22; // страница + подпись над ней + зазор

  // книга стала черновиком; место запоминаем, когда прокрутка остановилась (а не на каждой странице — это дёргало экран)
  const remember = (page: number) =>
    setLastBook({ title, cover: pages[0]?.photos[0] ?? 'night-window', params: { ...params, id, title, format, pages: String(pagesN), start: String(Math.min(page, pagesN - 1)), tariff }, at: Date.now() });
  useEffect(() => {
    startDraft(id);
    remember(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariff]);

  const tapPage = (page: number, e: GestureResponderEvent, cw = pageW, ch = pageH) => {
    if (fixing) return;
    Haptics.selectionAsync().catch(() => {});
    const x = Math.max(0.03, Math.min(0.97, e.nativeEvent.locationX / cw));
    const y = Math.max(0.06, Math.min(0.94, e.nativeEvent.locationY / ch));
    const slot = slotAt(pages[page].layout, x, y);
    // нажали на подпись — сразу редактор подписи
    if (slot < 0) return setCaptionFor(page);
    setMenu({ page, slot, x, y });
  };
  // прямая правка страницы — сразу, с возможностью отменить
  const editPage = (page: number, next: Page, what: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setUndo({ page, prev: edits[page], what });
    setEdits((e) => ({ ...e, [page]: next }));
    setMenu(null);
  };
  const undoLast = () => {
    if (!undo) return;
    setEdits((e) => {
      const next = { ...e };
      if (undo.prev) next[undo.page] = undo.prev;
      else delete next[undo.page];
      return next;
    });
    setUndo(null);
  };
  const replaceFromGallery = async () => {
    if (!menu) return;
    const { page, slot } = menu;
    setMenu(null);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const p = pages[page];
    editPage(page, { ...p, photos: p.photos.map((k, i) => (i === slot ? res.assets[0].uri : k)) }, 'Фото заменено');
  };
  const removePhoto = () => {
    if (!menu) return;
    const p = pages[menu.page];
    const left = p.photos.filter((_, i) => i !== menu.slot);
    editPage(menu.page, { layout: SIMPLE[Math.max(1, left.length)], photos: left }, 'Фото убрано');
  };
  const setLayout = (id: string) => {
    if (!menu) return;
    const page = menu.page;
    editPage(page, withLayout(pages[page], id, menu.slot), `Макет: ${layoutOf(id).name.toLowerCase()}`);
    // макет с подписью — сразу просим текст и место подписи
    if (layoutOf(id).caption) setTimeout(() => setCaptionFor(page), 280);
  };
  // редактор подписи страницы
  const [captionFor, setCaptionFor] = useState<number | null>(null);
  const saveCaption = (page: number, text: string, layout: string) => {
    const p = pages[page];
    editPage(page, { ...withLayout(p, layout), caption: text.trim() || undefined, fx: p.fx }, 'Подпись сохранена');
    setCaptionFor(null);
  };
  const commentHere = () => {
    if (!menu) return;
    setDraft({ id: nextPin.current++, page: menu.page, x: menu.x, y: menu.y, text: '', fixed: false });
    setMenu(null);
  };
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 4500);
    return () => clearTimeout(t);
  }, [undo]);
  const savePin = (text: string) => {
    if (!draft) return;
    const v = text.trim();
    if (!v) return setDraft(null);
    Haptics.selectionAsync().catch(() => {});
    setPins((ps) => (ps.some((p) => p.id === draft.id) ? ps.map((p) => (p.id === draft.id ? { ...p, text: v, fixed: false } : p)) : [...ps, { ...draft, text: v }]));
    setDraft(null);
  };
  const deletePin = () => {
    if (!draft) return;
    setPins((ps) => ps.filter((p) => p.id !== draft.id));
    setDraft(null);
  };

  // ИИ правит только страницы с замечаниями
  const fixAll = () => {
    if (!open.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFixing(true);
    setTimeout(() => {
      // улучшения («Свет и цвет», «Выровнять горизонт»…) — к тому фото, на котором стоит точка; остальное — правка страницы
      const byPage = new Map<number, { notes: string[]; fx: { slot: number; f: Fx }[] }>();
      open.forEach((p) => {
        const cur = byPage.get(p.page) ?? { notes: [], fx: [] };
        const f = fxOf(p.text);
        const slot = slotAt(pages[p.page].layout, p.x, p.y);
        if (f && slot >= 0) cur.fx.push({ slot, f });
        else cur.notes.push(p.text);
        byPage.set(p.page, cur);
      });
      setEdits((e) => {
        const next = { ...e };
        byPage.forEach(({ notes, fx }, page) => {
          let pg = notes.length ? fix(pages[page], notes, page * 3 + (e[page] ? 2 : 0)) : pages[page];
          fx.forEach(({ slot, f }) => {
            const had = pg.fx?.[slot] ?? [];
            pg = { ...pg, fx: { ...(pg.fx ?? {}), [slot]: had.includes(f) ? had : [...had, f] } };
          });
          next[page] = pg;
        });
        return next;
      });
      const words = open.map((p) => p.text).join(' ');
      if (/крупн/i.test(words)) addTaste('крупные фото');
      if (/селф|люд/i.test(words)) addTaste('меньше селфи');
      if (/ед[аыу]|еды/i.test(words)) addTaste('меньше еды');
      setPins((ps) => ps.map((p) => ({ ...p, fixed: true })));
      setFixing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 1400);
  };

  const order = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    orderNow({ projectId: id, title, tariff, tariffName: t.name, format: fmt, pages: pagesN, finish: 'Глянец', price, readyBy: t.readyBy, cover: pages[0]?.photos[0] ?? 'night-window' });
    router.push('/checkout');
  };

  return (
    <View style={[s.screen, { paddingTop: insets.top + 6 }]}>
      <StatusBar style="dark" />
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={2}>{title}</Text>
          <Text style={s.sub}>
            стр. {Math.min(at + 1, pagesN)} из {pagesN}
            {pins.length ? ` · замечаний ${pins.length}` : ''}
          </Text>
        </View>
        <Tap style={s.close} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть — книга останется в черновиках">
          <XIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.list, { paddingBottom: 24 }]}
        contentOffset={{ x: 0, y: Number(params.start ?? 0) * step }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        onScroll={(e) => {
          const n = Math.max(0, Math.min(pagesN - 1, Math.round(e.nativeEvent.contentOffset.y / step)));
          if (n !== at) setAt(n);
        }}
        onMomentumScrollEnd={(e) => remember(Math.round(e.nativeEvent.contentOffset.y / step))}
        onScrollEndDrag={(e) => remember(Math.round(e.nativeEvent.contentOffset.y / step))}>
        {/* как исправить — одной строкой над книгой */}
        <View style={s.tip}>
          <HandTapIcon size={16} color={colors.mut} weight="bold" />
          <Text style={s.tipText} numberOfLines={1}>Нажмите на фото, чтобы изменить</Text>
          <Tap onPress={() => setHint(true)} hitSlop={10} style={s.tipHelp} accessibilityRole="button" accessibilityLabel="Как это работает">
            <Text style={s.tipHelpText}>?</Text>
          </Tap>
        </View>

        {pages.map((p, k) => {
          // страница под сквозным фото предыдущей — уже нарисована вместе с ней
          if (k > 0 && isSpread(pages[k - 1].layout)) return null;
          const spread = isSpread(p.layout);
          const cw = pageW;
          const ch = spread ? pageW / 2 : pageH;
          const mine = pins.filter((x) => x.page === k);
          const fixedHere = mine.length > 0 && mine.every((x) => x.fixed);
          return (
            <View key={k} style={{ gap: 8 }}>
              <View style={s.pageLabel}>
                <Text style={s.pageNum}>{spread ? `стр. ${k + 1}–${k + 2} · на разворот` : `стр. ${k + 1}`}</Text>
                {spread && tariff !== 'premium' ? <Text style={s.seamNote}>шов по центру · на Premium без шва</Text> : null}
                {fixedHere ? (
                  <Animated.View entering={FadeIn.duration(250)} style={s.fixedTag}>
                    <CheckIcon size={11} color="#fff" weight="bold" />
                    <Text style={s.fixedText}>исправлено</Text>
                  </Animated.View>
                ) : null}
              </View>
              <View>
                <PageView page={p} w={cw} h={ch} dim={fixing && mine.some((x) => !x.fixed)} picked={menu?.page === k ? menu.slot : undefined} seam={spread && tariff !== 'premium'} />
                {/* слой касаний поверх всей страницы: координаты — от края страницы, а не от фото под пальцем */}
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={(e) => tapPage(k, e, cw, ch)}
                  accessibilityRole="button"
                  accessibilityLabel={`Страница ${k + 1}. Нажмите на фото, чтобы заменить его, поменять раскладку или оставить замечание`}
                />
                {/* точки замечаний */}
                {[...mine, ...(draft && draft.page === k && !pins.some((x) => x.id === draft.id) ? [draft] : [])].map((pin) => (
                  <PinDot
                    key={pin.id}
                    pin={pin}
                    n={pins.findIndex((x) => x.id === pin.id) + 1 || pins.length + 1}
                    left={pin.x * cw}
                    top={pin.y * ch}
                    active={draft?.id === pin.id}
                    onPress={() => setDraft(pin)}
                  />
                ))}
              </View>
            </View>
          );
        })}

        <Final
          pagesN={pagesN}
          fixed={pins.filter((p) => p.fixed).length}
          tariff={tariff}
          format={format}
          onTariff={(x) => {
            Haptics.selectionAsync().catch(() => {});
            setTariff(x);
          }}
          onMore={() => router.push({ pathname: '/book/[id]', params: { id, format: fmt, pages: String(pagesN) } })}
        />
      </ScrollView>

      {/* внизу: есть замечания — «Исправить N мест»; нет — цена, срок и «Заказать» */}
      <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]}>
        {fixing ? (
          <View style={{ flex: 1, paddingVertical: 14 }}>
            <ThinkingLine text={`Исправляем ${open.length} ${places(open.length)}…`} style={s.barMeta} />
          </View>
        ) : open.length ? (
          <>
            <View style={{ flex: 1 }}>
              <Text style={s.barPrice}>{open.length} {open.length === 1 ? 'замечание' : open.length < 5 ? 'замечания' : 'замечаний'}</Text>
              <Text style={s.barMeta} numberOfLines={1}>поправим только эти страницы</Text>
            </View>
            <Tap style={s.order} onPress={fixAll} accessibilityRole="button" accessibilityLabel={`Исправить ${open.length} ${places(open.length)}`}>
              <Text style={s.orderText}>Исправить</Text>
            </Tap>
          </>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              <Text style={s.barPrice}>{rub(price)}</Text>
              <Text style={s.barMeta} numberOfLines={1}>{t.name} · {fmt} · {pagesN} стр. · печать {PRINT_DAYS} дня</Text>
            </View>
            <Tap style={s.order} onPress={order} accessibilityRole="button" accessibilityLabel={`Заказать, ${t.name}, ${rub(price)}`}>
              <Text style={s.orderText}>Заказать</Text>
            </Tap>
          </>
        )}
      </View>

      {/* отмена последней прямой правки */}
      {undo ? (
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[s.toast, { bottom: insets.bottom + 92 }]}>
          <Text style={s.toastText}>{undo.what}</Text>
          <Tap onPress={undoLast} hitSlop={10} accessibilityRole="button">
            <Text style={s.toastLink}>Отменить</Text>
          </Tap>
        </Animated.View>
      ) : null}

      {menu ? (
        <PhotoMenu
          page={pages[menu.page]}
          pageN={menu.page + 1}
          slot={menu.slot}
          canSpread={menu.page < pagesN - 1}
          bottom={insets.bottom}
          onReplace={() => replaceFromGallery().catch(() => {})}
          onRemove={removePhoto}
          onLayout={setLayout}
          onComment={commentHere}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {captionFor !== null ? (
        <CaptionEditor
          page={pages[captionFor]}
          pageN={captionFor + 1}
          bottom={insets.bottom}
          onSave={(text, layout) => saveCaption(captionFor, text, layout)}
          onClose={() => setCaptionFor(null)}
        />
      ) : null}

      {draft ? (
        <Composer
          pin={draft}
          isNew={!pins.some((p) => p.id === draft.id)}
          bottom={insets.bottom}
          onSave={savePin}
          onDelete={deletePin}
          onClose={() => setDraft(null)}
        />
      ) : null}

      {/* первый раз (и по «?») — как пользоваться, три шага с анимацией */}
      <EditorGuide
        visible={hint}
        onClose={() => {
          setHint(false);
          setGesturesSeen(true);
        }}
      />
    </View>
  );
}

const places = (n: number) => (n === 1 ? 'место' : n < 5 ? 'места' : 'мест');
const FX_NAME: Record<Fx, string> = {
  light: 'Свет и цвет',
  crop: 'Кадр по лицам',
  sharp: 'Чётче и без шума',
  horizon: 'Выровнять горизонт',
  warm: 'Тёплые тона',
  bg: 'Убрать лишнее с фона',
  restore: 'Восстановить старое фото',
  bw: 'Чёрно-белое',
};
const FX_ORDER: Fx[] = ['light', 'sharp', 'crop', 'horizon', 'warm', 'bg', 'restore', 'bw'];
/** Замечание — это улучшение фото? («Свет и цвет», «выровняй горизонт», «сделай чёрно-белым»…) */
function fxOf(text: string): Fx | null {
  const t = text.toLowerCase();
  const exact = FX_ORDER.find((f) => t.includes(FX_NAME[f].toLowerCase()));
  if (exact) return exact;
  if (/горизонт/.test(t)) return 'horizon';
  if (/ч[её]рно-?бел|ч\/б/.test(t)) return 'bw';
  if (/т[её]пл/.test(t)) return 'warm';
  if (/св[ее]т|ярч|темн/.test(t)) return 'light';
  if (/ч[её]тк|шум|размыт/.test(t)) return 'sharp';
  if (/фон/.test(t)) return 'bg';
  if (/стар|восстан/.test(t)) return 'restore';
  return null;
}

/**
 * Страница книги: белый лист, фото — по прямоугольникам макета; «во всю страницу» — без полей.
 * Выбранное фото обведено коралловым (слоем поверх — размер не меняется). Улучшенное ИИ — с меткой «ИИ».
 */
function PageView({ page, w, h, dim, picked, seam }: { page: Page; w: number; h: number; dim?: boolean; picked?: number; seam?: boolean }) {
  const def = layoutOf(page.layout);
  const pad = def.bleed ? 0 : 12;
  const gap = def.bleed ? 0 : 8;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const box = (r: Rect) => ({ left: pad + r.x * iw + (r.x > 0 ? gap / 2 : 0), top: pad + r.y * ih + (r.y > 0 ? gap / 2 : 0), width: r.w * iw - (r.x > 0 ? gap / 2 : 0) - (r.x + r.w < 1 ? gap / 2 : 0), height: r.h * ih - (r.y > 0 ? gap / 2 : 0) - (r.y + r.h < 1 ? gap / 2 : 0) });
  return (
    <View style={[s.page, { width: w, height: h }, def.bleed && { padding: 0, overflow: 'hidden' }, dim && { opacity: 0.55 }]}>
      {def.slots.map((r, i) => {
        const k = page.photos[i];
        const fx = page.fx?.[i] ?? [];
        return (
          <View key={`${i}-${String(k)}`} style={[{ position: 'absolute', borderRadius: def.bleed ? 0 : 4, overflow: 'hidden', backgroundColor: colors.card2 }, box(r)]}>
            {k ? (
              <Image
                source={pic(k)}
                style={[StyleSheet.absoluteFill, (fx.includes('crop') || fx.includes('horizon')) && { transform: [{ scale: fx.includes('crop') ? 1.22 : 1.08 }, { rotate: fx.includes('horizon') ? '-2deg' : '0deg' }] }]}
                contentFit="cover"
                transition={300}
              />
            ) : null}
            {/* свет и цвет: в демо — мягкий тёплый осветляющий слой; в продукте — обработка на сервере */}
            {fx.includes('light') ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.fxLight]} /> : null}
            {fx.includes('warm') ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.fxWarm]} /> : null}
            {fx.length ? (
              <View style={s.fxTag} pointerEvents="none">
                <Text style={s.fxTagText}>ИИ</Text>
              </View>
            ) : null}
            {picked === i ? <Animated.View entering={FadeIn.duration(120)} pointerEvents="none" style={[StyleSheet.absoluteFill, s.picked]} /> : null}
          </View>
        );
      })}
      {/* сквозной разворот: на Classic и Lite по центру виден шов, на Premium — нет */}
      {seam ? <View pointerEvents="none" style={[s.seam, { left: w / 2 - 6 }]} /> : null}
      {def.caption ? (
        <View style={[{ position: 'absolute', justifyContent: 'center' }, box(def.caption)]}>
          <Text
            style={[s.caption, (def.captionAt === 'left' || def.captionAt === 'right') && { textAlign: def.captionAt === 'left' ? 'right' : 'left', fontSize: 12 }, !page.caption && { color: colors.mut2 }]}
            numberOfLines={def.captionAt === 'left' || def.captionAt === 'right' ? 6 : 2}>
            {page.caption ?? 'Нажмите, чтобы подписать'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Точка замечания: коралловая с номером; исправлено — бирюзовая с галочкой; рядом — первые слова. */
function PinDot({ pin, n, left, top, active, onPress }: { pin: Pin; n: number; left: number; top: number; active: boolean; onPress: () => void }) {
  return (
    <Animated.View entering={ZoomIn.duration(200)} style={[s.pinWrap, { left: left - 16, top: top - 16 }]}>
      <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Замечание ${n}: ${pin.text || 'новое'}${pin.fixed ? ', исправлено' : ''}`} style={[s.pin, pin.fixed && s.pinFixed, active && s.pinActive]}>
        {pin.fixed ? <CheckIcon size={14} color="#fff" weight="bold" /> : <Text style={s.pinN}>{n}</Text>}
      </Pressable>
      {/* подпись к точке — со стороны, где есть место: у правого края страницы — слева от точки, иначе справа */}
      {pin.text && !active ? (
        // у подписи своя ширина (иначе она сжимается до размера точки и превращается в «С…»), пузырь прижат к точке
        <View style={[s.pinNoteBox, pin.x > 0.5 ? { right: 38, alignItems: 'flex-end' } : { left: 38, alignItems: 'flex-start' }]} pointerEvents="none">
          <View style={[s.pinNote, pin.fixed && { backgroundColor: colors.tealTint }]}>
            <Text style={[s.pinNoteText, pin.fixed && { color: colors.tealInk }]} numberOfLines={1}>{pin.text}</Text>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

/**
 * Нажали на фото — что с ним сделать: заменить своим из галереи, убрать, оставить замечание;
 * выбрать макет страницы из библиотеки. Улучшения ИИ (свет, горизонт, чёткость…) — в «Замечании для ИИ».
 */
function PhotoMenu({ page, pageN, slot, bottom, canSpread, onReplace, onRemove, onLayout, onComment, onClose }: { page: Page; pageN: number; slot: number; bottom: number; canSpread: boolean; onReplace: () => void; onRemove: () => void; onLayout: (id: string) => void; onComment: () => void; onClose: () => void }) {
  const n = slotsOf(page.layout);
  const k = page.photos[slot];
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, s.sheetAbs, { bottom: -SHEET_TAIL, paddingBottom: bottom + 12 + SHEET_TAIL }]}>
        <View style={s.menuHead}>
          {k ? <Image source={pic(k)} style={s.menuThumb} contentFit="cover" /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.sheetTitle}>Это фото</Text>
            <Text style={s.sheetSub}>{isSpread(page.layout) ? `стр. ${pageN}–${pageN + 1}` : `стр. ${pageN}`} · фото {slot + 1} из {n}</Text>
          </View>
        </View>

        <View style={s.menuRow}>
          <MenuBtn icon={<ImagesIcon size={22} color={colors.fg} weight="bold" />} label="Заменить из галереи" onPress={onReplace} />
          <MenuBtn icon={<MinusCircleIcon size={22} color={n === 1 ? colors.mut2 : colors.fg} weight="bold" />} label="Убрать фото" onPress={onRemove} off={n === 1} />
          <MenuBtn icon={<ChatCircleTextIcon size={22} color={colors.fg} weight="bold" />} label="ИИ: исправить или улучшить" onPress={onComment} />
        </View>

        <Text style={s.menuLabel}>Макет страницы</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.layouts}>
          {LAYOUTS.filter((l) => !l.hidden && (canSpread || l.span !== 2)).map((l) => {
            const cur = layoutOf(page.layout);
            const on = l.id === page.layout || (!!cur.hidden && !!l.caption && l.slots.length === cur.slots.length);
            return (
              <Tap key={l.id} style={s.layoutBtn} onPress={() => !on && onLayout(l.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Макет: ${l.name}, фото: ${l.slots.length}`}>
                <View style={[s.layoutThumb, on && s.layoutThumbOn]}>
                  <LayoutIcon def={l} on={on} />
                </View>
                <Text style={[s.layoutName, on && { color: colors.fg, fontFamily: fonts.bold }]} numberOfLines={2}>{l.name}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      </Animated.View>
    </>
  );
}

function MenuBtn({ icon, label, onPress, off }: { icon: ReactNode; label: string; onPress: () => void; off?: boolean }) {
  return (
    <Tap style={[s.menuBtn, off && { opacity: 0.45 }]} disabled={off} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={s.menuIcon}>{icon}</View>
      <Text style={s.menuText} numberOfLines={2}>{label}</Text>
    </Tap>
  );
}

/** Схема макета маленькими прямоугольниками — по тем же долям, что и сама страница. */
function LayoutIcon({ def, on }: { def: LayoutDef; on: boolean }) {
  const W = def.span === 2 ? 54 : 40;
  const H = def.span === 2 ? 30 : 46;
  const pad = def.bleed ? 0 : 3;
  const c = on ? '#fff' : colors.mut;
  return (
    <View style={{ width: W, height: H }}>
      {def.slots.map((r, i) => (
        <View key={i} style={{ position: 'absolute', left: pad + r.x * (W - pad * 2) + 1, top: pad + r.y * (H - pad * 2) + 1, width: r.w * (W - pad * 2) - 2, height: r.h * (H - pad * 2) - 2, borderRadius: 2, backgroundColor: c }} />
      ))}
      {def.span === 2 ? <View style={{ position: 'absolute', left: W / 2 - 0.5, top: 0, bottom: 0, width: 1, backgroundColor: on ? colors.coralAction : colors.card }} /> : null}
      {def.caption ? <View style={{ position: 'absolute', left: pad + 4, right: pad + 4, top: pad + def.caption.y * (H - pad * 2) + 4, height: 3, borderRadius: 2, backgroundColor: c, opacity: 0.6 }} /> : null}
    </View>
  );
}

const PLACE_NAME: Record<CaptionAt, string> = { top: 'Сверху', bottom: 'Снизу', left: 'Слева', right: 'Справа' };
/** Готовые подписи в демо: дата и место — из снимков, «придумать» — от ИИ. */
const CAPTION_DATE = '12 июля 2026 · Карелия';
const CAPTION_AI = 'Вечер, когда солнце никак не хотело садиться';

/**
 * Подпись страницы: текст (свой, «дата и место» или «придумать ИИ») и где она стоит — сверху, снизу, слева, справа.
 * Сверху — живая мини-схема страницы: видно, куда встанет подпись. Лист едет вместе с клавиатурой.
 */
function CaptionEditor({ page, pageN, bottom, onSave, onClose }: { page: Page; pageN: number; bottom: number; onSave: (text: string, layout: string) => void; onClose: () => void }) {
  const [text, setText] = useState(page.caption ?? '');
  const [layout, setLayoutId] = useState(layoutOf(page.layout).caption ? page.layout : 'caption');
  const at = layoutOf(layout).captionAt ?? 'bottom';
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, kb.height.value - bottom) }] }));
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Отменить" />
      </Animated.View>
      <View style={s.sheetWrap} pointerEvents="box-none">
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[s.sheet, { paddingBottom: bottom + 12 }, lift]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Подпись</Text>
            <Text style={s.sheetSub}>стр. {pageN}</Text>
          </View>

          {/* где подпись: схема страницы и переключатель */}
          <View style={s.placeRow}>
            <View style={s.placeThumb}>
              <LayoutIcon def={layoutOf(layout)} on={false} />
            </View>
            <View style={s.places} accessibilityRole="radiogroup">
              {captionPlaces(layout).map((p) => {
                const on = p === at;
                return (
                  <Tap key={p} style={[s.place, on && s.placeOn]} onPress={() => setLayoutId(captionLayout(layout, p))} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={[s.placeText, on && { color: '#fff' }]}>{PLACE_NAME[p]}</Text>
                  </Tap>
                );
              })}
            </View>
          </View>

          <View style={s.field}>
            <TextInput value={text} onChangeText={setText} placeholder="Например: лето у бабушки" placeholderTextColor={colors.mut2} style={s.input} multiline accessibilityLabel="Текст подписи" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.quickRow} keyboardShouldPersistTaps="always">
            <Tap style={s.chip} onPress={() => setText(CAPTION_DATE)} accessibilityRole="button">
              <Text style={s.chipText}>Дата и место</Text>
            </Tap>
            <Tap style={[s.chip, s.chipFx]} onPress={() => setText(CAPTION_AI)} accessibilityRole="button">
              <Text style={[s.chipText, { color: colors.peachInk }]}>Придумать ИИ</Text>
            </Tap>
            {text ? (
              <Tap style={s.chip} onPress={() => setText('')} accessibilityRole="button">
                <Text style={s.chipText}>Без подписи</Text>
              </Tap>
            ) : null}
          </ScrollView>
          <Tap style={s.save} onPress={() => onSave(text, layout)} accessibilityRole="button">
            <Text style={s.saveText}>Готово</Text>
          </Tap>
        </Animated.View>
      </View>
    </>
  );
}

/** Что не так в этом месте: поле, быстрые варианты и голос. */
function Composer({ pin, isNew, bottom, onSave, onDelete, onClose }: { pin: Pin; isNew: boolean; bottom: number; onSave: (t: string) => void; onDelete: () => void; onClose: () => void }) {
  const [text, setText] = useState(pin.text);
  const [listening, setListening] = useState(false);
  // одно движение: лист проявляется на месте и едет вверх вместе с клавиатурой кадр в кадр (сдвигом, без пересчёта раскладки)
  const kb = useAnimatedKeyboard();
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(0, kb.height.value - bottom) }] }));
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (pin.text) return;
    const t = setTimeout(() => input.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [pin.text]);
  // голос — как в «Собрать по описанию»: снизу поднимается разноцветный свет и «дышит» с речью,
  // слова появляются по ходу; закончил говорить — свет гаснет, фраза остаётся в поле
  const level = useSharedValue(0);
  const voice = () => {
    if (listening) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    input.current?.blur();
    setText('');
    setListening(true);
  };
  useEffect(() => {
    if (!listening) {
      level.set(withTiming(0, { duration: 300 }));
      return;
    }
    const words = HEARD.split(' ');
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setText(words.slice(0, i).join(' '));
      if (i >= words.length) {
        clearInterval(t);
        setTimeout(() => setListening(false), 700);
      }
    }, 280);
    // shortcut: громкость имитируется; в продукте — уровень с микрофона
    const m = setInterval(() => {
      level.set(withTiming(i < words.length ? 0.35 + Math.random() * 0.65 : 0.08, { duration: 110 }));
    }, 110);
    return () => {
      clearInterval(t);
      clearInterval(m);
    };
  }, [listening, level]);
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Отменить" />
      </Animated.View>
      <View style={s.sheetWrap} pointerEvents="box-none">
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[s.sheet, { paddingBottom: bottom + 12 }, lift]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Что сделать здесь?</Text>
            <Text style={s.sheetSub}>стр. {pin.page + 1}</Text>
          </View>
          <View style={s.field}>
            {listening ? (
              <View style={{ flex: 1, minHeight: 44, justifyContent: 'center' }} accessibilityLiveRegion="polite">
                {text ? <Text style={s.input}>{text}</Text> : <ThinkingLine text="Слушаю…" style={s.input} />}
              </View>
            ) : (
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => onSave(text)}
                ref={input}
                placeholder="Например: убери это фото"
                placeholderTextColor={colors.mut2}
                returnKeyType="done"
                style={s.input}
                accessibilityLabel="Замечание к этому месту"
              />
            )}
            <Tap style={[s.mic, listening && s.micOn]} onPress={voice} accessibilityRole="button" accessibilityLabel={listening ? 'Слушаю' : 'Сказать голосом'}>
              <MicrophoneIcon size={18} color="#fff" weight="fill" />
            </Tap>
          </View>
          <Text style={s.quickLabel}>Поправить</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.quickRow} keyboardShouldPersistTaps="always">
            {QUICK.map((q) => (
              <Tap key={q} style={s.chip} onPress={() => onSave(q)} accessibilityRole="button">
                <Text style={s.chipText}>{q}</Text>
              </Tap>
            ))}
          </ScrollView>
          <Text style={s.quickLabel}>Улучшить фото</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.quickRow} keyboardShouldPersistTaps="always">
            {FX_ORDER.map((f) => (
              <Tap key={f} style={[s.chip, s.chipFx]} onPress={() => onSave(FX_NAME[f])} accessibilityRole="button">
                <Text style={[s.chipText, { color: colors.peachInk }]}>{FX_NAME[f]}</Text>
              </Tap>
            ))}
          </ScrollView>
          <View style={s.sheetBtns}>
            {isNew ? null : (
              <Tap style={s.del} onPress={onDelete} accessibilityRole="button" accessibilityLabel="Удалить замечание">
                <TrashIcon size={18} color={colors.coralLink} weight="bold" />
              </Tap>
            )}
            <Tap style={[s.save, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} onPress={() => onSave(text)} accessibilityRole="button">
              <Text style={s.saveText}>{isNew ? 'Оставить замечание' : 'Сохранить'}</Text>
            </Tap>
          </View>
        </Animated.View>
      </View>
      <VoiceGlow active={listening} processing={false} level={level} />
    </>
  );
}

/** В конце книги: итог и выбор тарифа пилюлями с ценой. */
function Final({ pagesN, fixed, tariff, format, onTariff, onMore }: { pagesN: number; fixed: number; tariff: Tariff['id']; format: string; onTariff: (t: Tariff['id']) => void; onMore: () => void }) {
  const list = useMemo(() => tariffs.map((t) => ({ t, fmt: fitFormat(t.id, format) })), [format]);
  return (
    <View style={s.final}>
      <View style={s.finalIcon}>
        <CheckIcon size={26} color={colors.tealInk} weight="bold" />
      </View>
      <Text style={s.finalTitle}>Это вся книга</Text>
      <Text style={s.finalSub}>{pagesN} стр. · {fixed ? `исправили ${fixed} ${places(fixed)}` : 'всё как собрал ИИ'}</Text>
      <View style={s.pills} accessibilityRole="radiogroup">
        {list.map(({ t, fmt }) => {
          const on = t.id === tariff;
          const p = bookPrice(t.id, fmt, pagesN, 'Глянец');
          return (
            <Tap key={t.id} style={[s.pill, on && s.pillOn]} onPress={() => onTariff(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t.name}, ${rub(p)}`}>
              <Text style={[s.pillName, on && { color: '#fff' }]}>{t.name}</Text>
              <Text style={[s.pillPrice, on && { color: 'rgba(255,255,255,0.9)' }]}>{rub(p)}</Text>
              <Text style={[s.pillRange, on && { color: 'rgba(255,255,255,0.75)' }]}>{BOOK[t.id].min}–{BOOK[t.id].max} стр.</Text>
            </Tap>
          );
        })}
      </View>
      <Tap onPress={onMore} hitSlop={8} accessibilityRole="button">
        <Text style={s.link}>Изменить формат и объём</Text>
      </Tap>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  title: { fontSize: 28, lineHeight: 33, fontFamily: fonts.display, letterSpacing: -0.7, color: colors.fg },
  sub: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut, marginTop: 2, fontVariant: ['tabular-nums'] },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, gap: GAP },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -8 },
  // текст не растягивается — «?» стоит сразу за ним, а не у края экрана
  tipText: { flexShrink: 1, fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  // «?» — заметный: коралловый кружок, а не серая обводка
  tipHelp: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  tipHelpText: { fontSize: 13, fontFamily: fonts.display, color: '#fff' },
  pageLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 14 },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 12, backgroundColor: 'rgba(0,0,0,0.10)' },
  seamNote: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.peachInk },
  pageNum: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.mut, fontVariant: ['tabular-nums'] },
  fixedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.tealInk },
  fixedText: { fontSize: 11.5, fontFamily: fonts.semibold, color: '#fff' },
  page: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 8, boxShadow: '0 8px 24px rgba(60,40,30,0.14)' },
  pinWrap: { position: 'absolute', width: 32, height: 32 },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.coralAction, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 8px rgba(0,0,0,0.25)' },
  pinFixed: { backgroundColor: colors.tealInk },
  pinActive: { transform: [{ scale: 1.15 }] },
  pinN: { fontSize: 13, fontFamily: fonts.bold, color: '#fff' },
  pinNoteBox: { position: 'absolute', top: 3, width: 170 },
  pinNote: { maxWidth: 170, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' },
  pinNoteText: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.fg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hair, backgroundColor: colors.bg },
  barPrice: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  barMeta: { fontSize: 12.5, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  order: { height: 52, paddingHorizontal: 26, borderRadius: 26, backgroundColor: colors.coralAction, justifyContent: 'center' },
  orderText: { fontSize: 17, fontFamily: fonts.semibold, color: '#fff' },
  scrim: { backgroundColor: 'rgba(20,16,14,0.3)' },
  picked: { borderRadius: 4, borderWidth: 3, borderColor: colors.coralAction },
  sheetAbs: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuThumb: { width: 52, height: 52, borderRadius: 12 },
  menuRow: { flexDirection: 'row', gap: 8 },
  menuBtn: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 6 },
  menuIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  menuText: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.fg, textAlign: 'center' },
  menuLabel: { fontSize: 13, fontFamily: fonts.semibold, color: colors.mut, marginTop: 2 },
  layouts: { paddingHorizontal: 16, gap: 10 },
  layoutBtn: { width: 64, alignItems: 'center', gap: 6 },
  layoutThumb: { width: 60, height: 64, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  layoutThumbOn: { backgroundColor: colors.coralAction },
  layoutName: { fontSize: 11, lineHeight: 14, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center' },
  quickLabel: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.mut, marginBottom: -4 },
  quickRow: { paddingHorizontal: 16, gap: 6 },
  chipFx: { backgroundColor: colors.peach },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeThumb: { width: 56, height: 60, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  places: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  place: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.card, justifyContent: 'center' },
  placeOn: { backgroundColor: colors.fg },
  placeText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.fg },
  fxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fxBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: colors.peach },
  fxBtnOn: { backgroundColor: colors.tealTint },
  fxText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.peachInk },
  fxLight: { backgroundColor: 'rgba(255,236,214,0.22)' },
  fxWarm: { backgroundColor: 'rgba(255,170,90,0.16)' },
  fxTag: { position: 'absolute', left: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: 'rgba(20,16,14,0.55)' },
  fxTagText: { fontSize: 10.5, fontFamily: fonts.bold, color: '#fff' },
  caption: { fontSize: 13, lineHeight: 17, fontFamily: fonts.medium, fontStyle: 'italic', color: colors.mut, textAlign: 'center', paddingHorizontal: 8 },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.fg, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  toastText: { fontSize: 15, fontFamily: fonts.semibold, color: '#fff' },
  toastLink: { fontSize: 15, fontFamily: fonts.bold, color: colors.peachStrong },
  sheetWrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  sheetSub: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 20, padding: 6, paddingLeft: 14 },
  input: { flex: 1, minHeight: 44, fontSize: 16, fontFamily: fonts.medium, color: colors.fg },
  mic: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  micOn: { backgroundColor: colors.fg },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.card, justifyContent: 'center' },
  chipText: { fontSize: 14, fontFamily: fonts.medium, color: colors.fg },
  sheetBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  del: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.coralTint, alignItems: 'center', justifyContent: 'center' },
  save: { flex: 1, height: 52, borderRadius: 26, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 16.5, fontFamily: fonts.semibold, color: '#fff' },
  final: { alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 28, padding: 20, marginTop: 4 },
  finalIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.tealTint, alignItems: 'center', justifyContent: 'center' },
  finalTitle: { fontSize: 24, fontFamily: fonts.display, letterSpacing: -0.6, color: colors.fg },
  finalSub: { fontSize: 14.5, fontFamily: fonts.medium, color: colors.mut, marginBottom: 6 },
  pills: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  pill: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 12 },
  pillOn: { backgroundColor: colors.coralAction },
  pillName: { fontSize: 16, fontFamily: fonts.bold, color: colors.fg },
  pillPrice: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.fg },
  pillRange: { fontSize: 11.5, fontFamily: fonts.regular, color: colors.mut },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink, paddingVertical: 4 },
});
