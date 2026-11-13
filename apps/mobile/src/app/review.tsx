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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowsOutLineHorizontalIcon, ArrowUUpLeftIcon, ArrowUUpRightIcon, CaretDownIcon, ChatCircleTextIcon, CheckIcon, CropIcon, FilePlusIcon, HandGrabbingIcon, HandTapIcon, ImagesIcon, MicrophoneIcon, MinusCircleIcon, PencilSimpleIcon, PlusIcon, SquaresFourIcon, StickerIcon, TrashIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, type SharedValue, useAnimatedKeyboard, useAnimatedStyle, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkOnServer, loadServerBook, onPrintUploads, photoPalette, printUploads, projectPhotos, renameProject, saveCover, savePages, serverBook, setBookBg, speechToText, facesOf, understandEdit, type EditCommand, type ServerPage } from '@/api/book';
import { findIssues, PreflightSheet, type Issue } from '@/components/preflight';
import { CropEditor, CroppedImage, type Crop } from '@/components/cropEditor';
import { DragUnit, FeedDrag } from '@/components/feedDrag';
import { useVoice } from '@/data/voice';
import { PageOrder } from '@/components/pageOrder';
import { SizeEditor } from '@/components/sizeEditor';
import { Slider } from '@/components/slider';
import { features } from '@/data/features';
import { pickPhotos } from '@/data/picked';
import { EditorGuide } from '@/components/editorGuide';
import { TariffSheet } from '@/components/tariffSheet';
import { Tap } from '@/components/ui';
import { bookPrice, BOOK, drafts, fitFormat, fitPages, PRINT_DAYS, spreads, tariffs, type PageLayout, type Tariff } from '@/data/demo';
import { CAPTION_FONTS, captionFontStyle } from '@/data/captionFonts';
import { BASE_COLORS, CAPTION_STYLES, captionText, defaultColorOn, isLight, lineSize, poorOn, SIZE_MAX, SIZE_MIN, sizeChanged, type CaptionLook, type CaptionStyle } from '@/data/captionLook';
import { BGS, PAGE_BG, PageBgContext, PageDecoContext, usePageBg, usePageDeco, type PageBg } from '@/data/bookStyle';
import { Corners, StaticStickers, StickerLayer, StickerPicker, type Sticker } from '@/components/stickers';
import { FRAMES, frameGeometry, type FrameId } from '@/data/frames';
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
/** crop — кадр, который человек выставил вручную: фото → центр и увеличение (по фото, а не по месту — переживает смену макета). */
/** slots — размеры фото, которые человек поменял сам (components/sizeEditor.tsx); нет — как в макете. */
type Page = { layout: string; photos: Pic[]; fx?: Record<number, Fx[]>; caption?: string; captionFont?: string; captionLook?: CaptionLook; crop?: Record<string, Crop>; slots?: Rect[]; frame?: FrameId; stickers?: Sticker[] };
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
const GAP = 22;
const DRAG_TIP_KEY = 'picpac.tip.dragPages';
/** Название книги: на обложке помещается две строки. */
const TITLE_MAX = 60;
/** Сколько страниц до и после той, что на экране, рисуются с фото (остальные — пустые блоки той же высоты). */
const NEAR_BEFORE = 4;
const NEAR_AFTER = 8;
/** Сколько шагов «назад» помнит история правок. */
const HISTORY_MAX = 50;

/** Страницы книги из демо-разворотов: левая и правая страница каждого разворота по очереди. */
function makePages(n: number): Page[] {
  const flat: Page[] = spreads.flatMap((sp) => [
    { layout: FROM_DEMO[sp.left], photos: sp.photos.slice(0, count(sp.left)) as Pic[] },
    { layout: FROM_DEMO[sp.right], photos: sp.photos.slice(count(sp.left)) as Pic[] },
  ]);
  return Array.from({ length: n }, (_, i) => flat[i % flat.length]);
}

/**
 * «ИИ: исправить»: замечание понимает сервер (модель или правила — services/api/app/ai/edit.py) и возвращает
 * ОДНУ команду; выполняет её этот код — точно и только на этой странице, начиная с фото под точкой.
 * Нет связи с сервером — localCommand (те же основные правила здесь).
 */
function localCommand(text: string): EditCommand {
  const t = ` ${text.toLowerCase()} `;
  const cap = /подпиш\w*\s*[:—-]?\s*(.+)/i.exec(text);
  if (cap?.[1]?.trim()) return { action: 'caption', text: cap[1].trim().slice(0, 120) };
  const f = fxOf(text);
  if (f) return { action: 'enhance', fx: f };
  if (/селфи|меньше люд|без люд|без лиц/.test(t)) return { action: 'fewer_people' };
  if (/больше люд|где мы|вместе/.test(t)) return { action: 'more_people' };
  if (/пейзаж|природ/.test(t)) return { action: 'more_landscapes' };
  const m = /\s(одн|дв|тр|четыр|[1-4])\S*\s+(фот|кадр|снимк)/.exec(t);
  if (m) return { action: 'set_count', count: /\d/.test(m[1]) ? Number(m[1]) : { одн: 1, дв: 2, тр: 3, четыр: 4 }[m[1]] };
  if (/коллаж/.test(t)) return { action: 'set_count', count: 4 };
  if (/(по)?меньш|уменьш|скромн|не на всю/.test(t)) return { action: 'shrink' };
  if (/крупн|увелич|побольш|на всю страниц|больше\s/.test(t)) return { action: 'enlarge' };
  if (/убер|убра|удал|не надо|лишн/.test(t)) return { action: 'remove_photo' };
  if (/(замени|поменяй|другие).*(вс[её]|страниц)/.test(t)) return { action: 'replace_page' };
  if (/замен|поменя|друг(ое|ую|ой)|не то/.test(t)) return { action: 'replace_photo' };
  return { action: 'unknown' };
}

/** Чем подменять фото: «any» — любое свободное, «nopeople» — без людей (пейзаж), «people» — с людьми. */
type Want = 'any' | 'nopeople' | 'people';
/**
 * Выполнить команду на странице. slot — фото, на котором стоит точка. take — следующее свободное фото книги
 * (не стоящее нигде), с людьми или без. hasPeople — есть ли люди на фото. null — не поняли или нечем выполнить
 * (why — почему, коротко для человека).
 */
function applyCommand(p: Page, cmd: EditCommand, slot: number, take: (want: Want) => Pic | undefined, hasPeople: (k: Pic) => boolean | undefined): { page: Page } | { why: string } {
  const photos = p.photos;
  const n = Math.max(1, slotsOf(p.layout));
  const at = Math.min(Math.max(0, slot), Math.max(0, photos.length - 1));
  switch (cmd.action) {
    case 'enhance': {
      const f = cmd.fx as Fx | undefined;
      if (!f || !photos[at]) return { why: 'на этом месте нет фото' };
      const had = p.fx?.[at] ?? [];
      return { page: { ...p, fx: { ...(p.fx ?? {}), [at]: had.includes(f) ? had : [...had, f] } } };
    }
    case 'shrink':
      // одно фото — с полями вокруг; несколько — белые поля у каждого (фото становятся меньше)
      if (photos.length <= 1) return { page: { ...p, layout: p.layout === 'margin' ? 'small-caption' : 'margin', slots: undefined } };
      return { page: { ...p, frame: 'mat' } };
    case 'enlarge': {
      const k = photos[at];
      if (!k) return { why: 'на этом месте нет фото' };
      // уже одно на странице — во всю страницу, без полей
      return { page: { ...p, layout: p.layout === 'one' ? 'bleed' : 'one', photos: [k], fx: p.fx?.[at] ? { 0: p.fx[at] } : undefined, slots: undefined, frame: undefined } };
    }
    case 'remove_photo': {
      if (!photos[at]) return { why: 'на этом месте нет фото' };
      const left = photos.filter((_, i) => i !== at);
      return { page: { ...p, layout: SIMPLE[Math.max(1, left.length)], photos: left, slots: undefined } };
    }
    case 'replace_photo': {
      const k = take('any');
      if (!k) return { why: 'в книге нет свободных фото — добавьте из галереи' };
      return { page: { ...p, photos: photos.map((x, i) => (i === at ? k : x)) } };
    }
    case 'replace_page': {
      const next = photos.map((x) => take('any') ?? x);
      return next.some((k, i) => k !== photos[i]) ? { page: { ...p, photos: next } } : { why: 'в книге нет свободных фото' };
    }
    case 'set_count': {
      const c = Math.min(4, Math.max(1, cmd.count ?? 1));
      const list = [photos[at], ...photos.filter((_, i) => i !== at)].filter(Boolean) as Pic[];
      while (list.length < c) {
        const k = take('any');
        if (!k) break;
        list.push(k);
      }
      if (list.length < c) return { why: `для ${c} фото не хватает свободных фото в книге` };
      return { page: { ...p, layout: SIMPLE[c], photos: list.slice(0, c), slots: undefined } };
    }
    case 'fewer_people':
    case 'more_landscapes':
    case 'more_people': {
      // «меньше людей» / «пейзажи» — фото с людьми меняем на фото без людей; «больше людей» — наоборот
      const wantPeople = cmd.action === 'more_people';
      let changed = false;
      const next = photos.map((k) => {
        const people = hasPeople(k);
        if (people === undefined || people === wantPeople) return k;
        const other = take(wantPeople ? 'people' : 'nopeople');
        if (!other) return k;
        changed = true;
        return other;
      });
      if (changed) return { page: { ...p, photos: next } };
      const all = photos.every((k) => hasPeople(k) === wantPeople);
      return { why: all ? (wantPeople ? 'здесь уже фото с людьми' : 'здесь уже нет людей') : 'нет подходящих свободных фото' };
    }
    case 'caption': {
      const text = (cmd.text ?? '').trim();
      if (!text) return { why: 'не поняла, что написать' };
      const layout = layoutOf(p.layout).caption ? p.layout : n === 2 ? 'two-caption' : 'caption';
      const kept = layoutOf(layout).slots.length;
      return { page: { ...p, layout, photos: photos.slice(0, kept), caption: text, slots: undefined } };
    }
    default:
      return { why: 'не поняла, что сделать' };
  }
}

/** Сменить макет: лишние фото уходят, недостающие — добираем из того же дня; улучшения ИИ остаются у своих фото. */
/** source — откуда добирать фото: в демо-книге — демо-снимки, в своей книге — только фото человека из проекта. */
function withLayout(p: Page, layout: string, keep = 0, source: Pic[] = POOL): Page {
  const n = slotsOf(layout);
  // фото, на которое нажали, идёт первым: выбрали «одно крупное» — останется именно оно
  const order = [p.photos[keep], ...p.photos.filter((_, i) => i !== keep)].filter((x): x is Pic => !!x);
  const extra = source.filter((k) => !order.includes(k));
  const fx = p.fx?.[keep] ? { 0: p.fx[keep] } : undefined;
  // новый макет — свои размеры фото сбрасываются: у макета другие рамки
  return { ...p, layout, photos: [...order.slice(0, n), ...extra].slice(0, n), fx: keep ? fx : p.fx, slots: undefined };
}

export default function Review() {
  const params = useLocalSearchParams<Record<string, string>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { orderNow, setLastBook, startDraft, gesturesSeen, setGesturesSeen, addTaste, saveServerDraft } = useStore();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // прокрутка ленты — для перетаскивания страниц (страница едет вместе с прокруткой у края)
  const scrollY = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  // подсказка «зажмите и перетащите» — один раз, пока не закроют или не переставят страницу сами
  const [dragTip, setDragTip] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(DRAG_TIP_KEY)
      .then((v) => setDragTip(!v))
      .catch(() => {});
  }, []);
  const closeDragTip = () => {
    setDragTip(false);
    AsyncStorage.setItem(DRAG_TIP_KEY, '1').catch(() => {});
  };
  const { height: winH } = useWindowDimensions();
  const nextPin = useRef(1);

  const id = params.id ?? 'karelia';
  const d = drafts[id];
  // название меняют прямо здесь: нажали на него — поле ввода (оно же на обложке и в «Черновиках»)
  const [title, setTitle] = useState(params.title ?? d?.title ?? 'Новая книга');
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const format = params.format ?? d?.format ?? '20×20';
  const total = Math.max(2, Number(params.pages ?? d?.pages ?? 24));
  const [tariff, setTariff] = useState<Tariff['id']>((params.tariff as Tariff['id']) ?? 'lite');
  // книга с сервера — столько страниц, сколько собрал сервер (а не сколько просили): иначе правки «лишних» страниц
  // сервер не принимал; меньше минимума тарифа всё равно не бывает
  const serverPages = serverBook(params.projectId)?.pages.length;
  const builtN = fitPages(tariff, serverPages || total);
  // Открыли книгу с сервера, которой нет в памяти (например, из «Черновиков» после перезапуска), — подгружаем.
  const [loadedTick, setLoadedTick] = useState(0);
  const fromServer = serverBook(params.projectId);
  // своя книга, которой нет в памяти (открыли из «Черновиков» после перезапуска), — пока грузится, страниц не показываем
  const opening = !!params.projectId && !fromServer;
  const [openFailed, setOpenFailed] = useState(false);
  const [openTry, setOpenTry] = useState(0);
  useEffect(() => {
    if (!params.projectId || serverBook(params.projectId)) return;
    loadServerBook(params.projectId, title)
      .then(() => setLoadedTick((x) => x + 1))
      .catch(() => setOpenFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.projectId, openTry]);
  // книга, как её собрал ИИ: с сервера (недостающие до объёма тарифа — пустые листы) или демо
  const built = useMemo<Page[]>(
    // своя книга ещё грузится с сервера — пусто (раньше на это время показывалась демо-книга с чужими фото,
    // и её обложка успевала попасть в карточку черновика)
    () => (fromServer ? Array.from({ length: builtN }, (_, k) => (fromServer.pages[k] as Page | undefined) ?? { layout: 'one', photos: [] }) : params.projectId ? [] : makePages(builtN)),
    // loadedTick — книга догрузилась с сервера
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [builtN, fromServer, loadedTick],
  );
  // Книга после правок — все страницы по порядку. Пока человек ничего не менял — null, книга как собрал ИИ.
  // Целиком, а не «номер страницы → правка»: страницы добавляют, вставляют, удаляют и переставляют, номера сдвигаются.
  const [book, setBook] = useState<Page[] | null>(null);
  const raw = book ?? built;
  // меньше минимума тарифа книги не бывает (сменили Lite → Classic и т. п.): недостающие — пустые страницы в конце
  const minPages = BOOK[tariff].min;
  const pagesN = Math.max(raw.length, minPages);
  // фото на весь разворот — во всех тарифах; в Lite по центру шов (его показываем), в Classic и Premium — нет
  const pages = useMemo(
    () => (raw.length >= minPages ? raw : [...raw, ...Array.from({ length: minPages - raw.length }, () => ({ layout: 'one', photos: [] }) as Page)]),
    [raw, minPages],
  );
  /** Правка книги: fn получает все страницы и возвращает новые. */
  const mutate = (fn: (all: Page[]) => Page[]) => setBook((b) => fn([...(b ?? pages)]));

  // Обложка — отдельно от страниц, первой; не переставляется и не удаляется. Фото не выбрано — первое фото книги.
  // frontCrop / backCrop — кадр фото на стороне обложки («Подвинуть и обрезать», как у фото на страницах)
  // wrap — одно фото на всю обложку (задняя сторона, корешок, лицевая); его кадр — frontCrop
  type Cover = { photo?: Pic; back?: Pic; title: boolean; frontCrop?: Crop; backCrop?: Crop; wrap?: boolean };
  // какую сторону обложки сейчас кадрируют
  const [coverCrop, setCoverCrop] = useState<'front' | 'back' | null>(null);
  const [coverEdit, setCoverEdit] = useState<Cover | null>(null);
  const cover: Cover = coverEdit ?? (fromServer?.cover as Cover | undefined) ?? { title: true };
  const [coverOpen, setCoverOpen] = useState(false);
  const pushCover = (c: Cover) => {
    if (params.projectId && serverBook(params.projectId)) saveCover(params.projectId, { photo: c.photo ? String(c.photo) : undefined, back: c.back ? String(c.back) : undefined, title: c.title, frontCrop: c.frontCrop, backCrop: c.backCrop, wrap: c.wrap }).catch(() => {});
  };
  // фон страниц: из вопросов перед сборкой (сервер), меняется в редакторе для всей книги
  const [bgEdit, setBgEdit] = useState<PageBg | null>(null);
  const bg: PageBg = bgEdit ?? fromServer?.bg ?? 'white';
  const [bgOpen, setBgOpen] = useState(false);
  const pushBg = (b: PageBg) => {
    if (params.projectId && serverBook(params.projectId)) setBookBg(params.projectId, b).catch(() => {});
  };

  // откуда ИИ и смена макета берут фото: в своей книге — только фото человека из проекта (сначала те, что ещё не в книге),
  // в демо-книге — демо-снимки
  const [ownPhotos, setOwnPhotos] = useState<string[]>([]);
  useEffect(() => {
    if (!params.projectId) return;
    projectPhotos(params.projectId)
      .then(setOwnPhotos)
      .catch(() => {});
  }, [params.projectId]);
  // в своей книге — только фото, которых в книге ещё нет: одно и то же фото дважды не ставим
  const source = useMemo<Pic[]>(() => {
    if (!params.projectId) return POOL;
    const inBook = new Set(pages.flatMap((p) => p.photos).filter(Boolean).map(String));
    return [...new Set(ownPhotos)].filter((k) => !inBook.has(k));
  }, [params.projectId, ownPhotos, pages]);
  // макет на больше фото, чем есть свободных: не дублируем, а спрашиваем — добавить из галереи или оставить рамки пустыми
  const [needPhotos, setNeedPhotos] = useState<{ page: number; layout: string; slot: number; need: number } | null>(null);

  // каждая правка (фото, макет, подпись, «Исправить», новые и переставленные страницы) сохраняется на сервере —
  // вся книга разом, через секунду после последней правки (подряд идущие правки — одним запросом)
  const synced = useRef('');
  useEffect(() => {
    const pid = params.projectId;
    if (!pid || !book || !serverBook(pid)) return;
    const key = JSON.stringify(book);
    if (synced.current === key) return;
    const t = setTimeout(() => {
      synced.current = key;
      savePages(pid, book as ServerPage[]).catch(() => {
        synced.current = '';
      });
    }, 900);
    return () => clearTimeout(t);
  }, [book, params.projectId]);
  const [pins, setPins] = useState<Pin[]>([]);
  // точка, к которой сейчас пишут замечание (новая или уже стоящая)
  const [draft, setDraft] = useState<Pin | null>(null);
  // нажали на фото — меню: заменить из галереи, убрать, раскладка 1–4, комментарий
  const [menu, setMenu] = useState<{ page: number; slot: number; x: number; y: number } | null>(null);
  // какая страница сейчас на экране (по прокрутке)
  const [at, setAt] = useState(() => Number(params.start ?? 0));
  // История правок: ↶ назад и ↷ вперёд в шапке. Снимок — всё, что человек меняет: страницы, обложка, название,
  // тариф, замечания. Перед каждой правкой — record(); новая правка после «назад» стирает «вперёд».
  type Snap = { book: Page[] | null; cover: Cover | null; title: string; tariff: Tariff['id']; pins: Pin[]; bg: PageBg | null };
  // после удаления фото или страницы — плашка «Отменить» рядом с пальцем (это тот же шаг «назад»)
  const [undo, setUndo] = useState<{ what: string } | null>(null);
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const snap = (): Snap => ({ book, cover: coverEdit, title, tariff, pins, bg: bgEdit });
  const record = () => {
    setPast((p) => [...p.slice(-(HISTORY_MAX - 1)), snap()]);
    setFuture([]);
  };
  const restore = (x: Snap) => {
    setMenu(null);
    setBook(x.book);
    setTariff(x.tariff);
    setPins(x.pins);
    if (x.bg !== bgEdit) {
      setBgEdit(x.bg);
      pushBg(x.bg ?? fromServer?.bg ?? 'white');
    }
    if (x.cover !== coverEdit) {
      setCoverEdit(x.cover);
      pushCover(x.cover ?? (fromServer?.cover as Cover | undefined) ?? { title: true });
    }
    if (x.title !== title) {
      setTitle(x.title);
      if (params.projectId && serverBook(params.projectId)) renameProject(params.projectId, x.title).catch(() => {});
    }
  };
  const back = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    Haptics.selectionAsync().catch(() => {});
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [...f, snap()]);
    restore(prev);
    setUndo(null);
  };
  const forward = () => {
    const next = future[future.length - 1];
    if (!next) return;
    Haptics.selectionAsync().catch(() => {});
    setFuture((f) => f.slice(0, -1));
    setPast((p) => [...p, snap()]);
    restore(next);
  };

  const startRename = () => {
    Haptics.selectionAsync().catch(() => {});
    setTitleDraft(title);
    setRenaming(true);
  };
  const finishRename = () => {
    setRenaming(false);
    const v = titleDraft.trim().replace(/\s+/g, ' ').slice(0, TITLE_MAX);
    if (!v || v === title) return;
    record();
    setTitle(v);
    if (params.projectId && serverBook(params.projectId)) renameProject(params.projectId, v).catch(() => {});
  };
  const saveCoverNow = (next: Cover) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record();
    setCoverEdit(next);
    pushCover(next);
  };
  // стикеры: какой выделен (страница и номер), правка стикеров страницы — шаг истории, выбор стикера из наборов
  const [stickerSel, setStickerSel] = useState<{ page: number; i: number } | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const editStickers = (page: number, next: Sticker[]) => {
    record();
    mutate((all) => {
      all[page] = { ...all[page], stickers: next.length ? next : undefined };
      return all;
    });
  };
  const addSticker = (id: string) => {
    setStickerOpen(false);
    // на страницу, которую сейчас смотрят (у разворота — на его первую страницу)
    const k = Math.min(at, pages.length - 1);
    const page = k > 0 && isSpread(pages[k - 1].layout) ? k - 1 : k;
    const list = pages[page].stickers ?? [];
    editStickers(page, [...list, { id, x: 0.5, y: 0.5, s: 0.2, r: 0 }]);
    setStickerSel({ page, i: list.length });
  };
  const changeBg = (b: PageBg) => {
    Haptics.selectionAsync().catch(() => {});
    if (b === bg) return;
    record();
    setBgEdit(b);
    pushBg(b);
  };
  const changeTariff = (x: Tariff['id']) => {
    Haptics.selectionAsync().catch(() => {});
    if (x === tariff) return;
    record();
    setTariff(x);
    // в Lite разворотов нет: фото на разворот становятся обычными страницами (↶ вернёт вместе с тарифом)
    if (x === 'lite' && pages.some((p) => isSpread(p.layout))) {
      mutate((all) => all.map((p) => (isSpread(p.layout) ? { ...p, layout: SIMPLE[Math.min(4, Math.max(1, slotsOf(p.layout)))], slots: undefined } : p)));
      setNotice('В Lite нет разворотов — эти фото теперь на обычных страницах');
    }
  };
  const [fixing, setFixing] = useState(false);
  // копии для печати, которые догружаются в фоне (книга собрана по черновым): «Фото для печати: N из M»
  const [prints, setPrints] = useState(printUploads);
  useEffect(() => onPrintUploads(() => setPrints(printUploads())), []);
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

  const firstPhoto = pages.find((p) => p.photos[0])?.photos[0];
  // лицевая сторона обложки: выбранное фото или первое фото книги
  const front = cover.photo ?? firstPhoto;
  // книга стала черновиком; место запоминаем, когда прокрутка остановилась (а не на каждой странице — это дёргало экран)
  const remember = (page: number) =>
    setLastBook({ title, cover: front ?? 'night-window', params: { ...params, id, title, format, pages: String(pagesN), start: String(Math.min(page, pagesN - 1)), tariff }, at: Date.now() });
  useEffect(() => {
    startDraft(id);
    // книга ещё грузится — не запоминаем: в карточку попала бы пустая или чужая обложка
    if (!opening) remember(at);
    // title — переименовали книгу: карточка «продолжить» на главной с новым названием
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tariff, title, opening]);
  // книга с сервера — карточка для «Черновиков» (у демо-книг она уже есть в данных)
  useEffect(() => {
    if (!params.projectId || !front) return;
    saveServerDraft(params.projectId, { title, cover: front, pages: pagesN, format: fmt, photos: pages.reduce((a, p) => a + p.photos.length, 0) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.projectId, front, pagesN, fmt, title]);

  const tapPage = (page: number, e: GestureResponderEvent, cw = pageW, ch = pageH) => {
    if (fixing) return;
    // нажали мимо стикера — снимаем с него выделение
    if (stickerSel) return setStickerSel(null);
    Haptics.selectionAsync().catch(() => {});
    const x = Math.max(0.03, Math.min(0.97, e.nativeEvent.locationX / cw));
    const y = Math.max(0.06, Math.min(0.94, e.nativeEvent.locationY / ch));
    const slot = slotAt(pages[page].layout, x, y, pages[page].slots);
    // нажали на подпись — сразу редактор подписи
    if (slot < 0) return setCaptionFor(page);
    setMenu({ page, slot, x, y });
  };
  // прямая правка страницы — сразу, с возможностью отменить
  const editPage = (page: number, next: Page, what: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record();
    // плашка «Отменить» — только когда что-то убрали; остальное возвращается стрелкой ↶ в шапке
    setUndo(/убран/i.test(what) ? { what } : null);
    mutate((all) => {
      all[page] = next;
      return all;
    });
    setMenu(null);
  };
  const undoLast = () => {
    if (!undo) return;
    back();
  };
  const replaceFromGallery = async () => {
    if (!menu) return;
    const { page, slot } = menu;
    setMenu(null);
    // фото, которое уже есть в книге, повторно не ставим — говорим об этом
    const inBook = pages.flatMap((pg) => pg.photos).filter((x): x is string => typeof x === 'string');
    const picked = await pickPhotos(inBook, { multiple: false });
    if (!picked) return;
    if (!picked.fresh[0]) {
      setNotice(picked.bad.length ? `Формат ${picked.bad[0]} не печатаем — выберите JPEG, PNG или HEIC` : 'Это фото уже есть в книге — выберите другое');
      return;
    }
    const p = pages[page];
    // у пустой страницы (или пустой рамки) фото на этом месте ещё нет — список фото короче числа рамок:
    // раньше заменяли «по месту в списке», и новое фото терялось. Ставим ровно в нажатую рамку.
    const photos = Array.from({ length: Math.max(slotsOf(p.layout), p.photos.length) }, (_, i) => p.photos[i]);
    const had = !!photos[slot];
    photos[slot] = picked.fresh[0];
    // пустые места в конце не храним; дырки в середине — пустые рамки (их подсветит проверка перед заказом)
    while (photos.length && !photos[photos.length - 1]) photos.pop();
    editPage(page, { ...p, photos: photos as Pic[] }, had ? 'Фото заменено' : 'Фото добавлено');
  };
  const removePhoto = () => {
    if (!menu) return;
    const p = pages[menu.page];
    const left = p.photos.filter((_, i) => i !== menu.slot);
    // кадры оставшихся фото не теряются
    editPage(menu.page, { layout: SIMPLE[Math.max(1, left.length)], photos: left, crop: p.crop }, 'Фото убрано');
  };
  // размеры фото на странице: какую страницу сейчас правят
  const [sizeFor, setSizeFor] = useState<number | null>(null);
  const saveSizes = (slots: Rect[] | undefined) => {
    if (sizeFor === null) return;
    const p = pages[sizeFor];
    setSizeFor(null);
    editPage(sizeFor, { ...p, slots }, slots ? 'Размеры фото сохранены' : 'Размеры как в макете');
  };
  // ручной кадр: какое фото сейчас двигают (страница и место на ней)
  const [cropFor, setCropFor] = useState<{ page: number; slot: number } | null>(null);
  const openCrop = () => {
    if (!menu) return;
    setCropFor({ page: menu.page, slot: menu.slot });
    setMenu(null);
  };
  const saveCrop = (c: Crop | undefined) => {
    if (!cropFor) return;
    const p = pages[cropFor.page];
    const k = p.photos[cropFor.slot];
    setCropFor(null);
    if (!k) return;
    const crop = { ...p.crop };
    if (c) crop[String(k)] = c;
    else delete crop[String(k)];
    editPage(cropFor.page, { ...p, crop: Object.keys(crop).length ? crop : undefined }, c ? 'Кадр сохранён' : 'Кадр как было');
  };
  // порядок страниц: плитки — страницы, разворот на две страницы — одна плитка
  const [orderOpen, setOrderOpen] = useState(false);
  const units = useMemo(() => {
    const out: number[][] = [];
    for (let k = 0; k < pages.length; k++) {
      if (isSpread(pages[k].layout) && k + 1 < pages.length) {
        out.push([k, k + 1]);
        k++;
      } else out.push([k]);
    }
    return out;
  }, [pages]);
  const openOrder = () => {
    if (fixing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setMenu(null);
    setOrderOpen(true);
  };
  const applyOrder = (order: number[]) => {
    setOrderOpen(false);
    // новое место → какая страница там была
    const flat = order.flatMap((u) => units[u]);
    if (flat.every((old, pos) => old === pos)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setBook(flat.map((old) => pages[old]));
    // замечания переезжают вместе со своими страницами
    setPins((ps) => ps.map((p) => ({ ...p, page: Math.max(0, flat.indexOf(p.page)) })));
    record();
    setNotice('Порядок страниц изменён');
    // переставил сам — подсказка больше не нужна
    if (dragTip) closeDragTip();
  };
  // Добавить, вставить и удалить страницы. Цена — за разворот: при нечётном числе страниц у последнего разворота
  // есть оплаченное пустое место, новая страница встаёт туда бесплатно. Новая страница — пустая, «Добавить фото».
  const stepPrice = BOOK[tariff].step;
  const addPrice = pagesN % 2 ? 'бесплатно, на развороте есть место' : `+${rub(stepPrice)}`;
  // вставка или удаление одной страницы сдвигает все следующие на другую сторону листа — фото «на разворот»
  // после этого места разъехалось бы на два листа: спрашиваем, как быть
  const [spreadAsk, setSpreadAsk] = useState<{ kind: 'insert' | 'delete'; at: number } | null>(null);
  const spreadsFrom = (at: number) => pages.slice(at).some((p) => isSpread(p.layout));
  const flatten = (p: Page): Page => (isSpread(p.layout) ? { ...p, layout: SIMPLE[Math.min(4, Math.max(1, slotsOf(p.layout)))], slots: undefined } : p);
  // замечания едут со своими страницами; у удалённых страниц (by < 0: [from + by, from)) — пропадают
  const shiftPins = (from: number, by: number) =>
    setPins((ps) => ps.filter((p) => by > 0 || p.page < from + by || p.page >= from).map((p) => (p.page >= from ? { ...p, page: p.page + by } : p)));
  const insertPages = (at: number, n: number, opts: { flattenAfter?: boolean } = {}) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record();
    setUndo(null);
    setNotice(n === 1 ? 'Страница добавлена' : `Добавлено страниц: ${n}`);
    mutate((all) => {
      const tail = all.slice(at).map((p) => (opts.flattenAfter ? flatten(p) : p));
      return [...all.slice(0, at), ...Array.from({ length: n }, () => ({ layout: 'one', photos: [] }) as Page), ...tail];
    });
    shiftPins(at, n);
    setMenu(null);
  };
  /** Вставить пустую страницу на место at (в конец — at = число страниц). */
  const insertPage = (at: number) => {
    setMenu(null);
    if (pagesN + 1 > BOOK[tariff].max) return setNotice(`В ${t.name} не больше ${BOOK[tariff].max} страниц`);
    if (spreadsFrom(at)) return setSpreadAsk({ kind: 'insert', at });
    insertPages(at, 1);
    if (at >= pagesN) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };
  /** Удалить страницу k (фото на весь разворот — обе его страницы). */
  const deletePage = (k: number, opts: { flattenAfter?: boolean } = {}) => {
    setMenu(null);
    const n = isSpread(pages[k].layout) ? 2 : 1;
    if (pagesN - n < minPages) return setNotice(`В ${t.name} не меньше ${minPages} страниц`);
    if (n === 1 && !opts.flattenAfter && spreadsFrom(k + 1)) return setSpreadAsk({ kind: 'delete', at: k });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    record();
    setUndo({ what: 'Страница удалена' });
    mutate((all) => [...all.slice(0, k), ...all.slice(k + n).map((p) => (opts.flattenAfter ? flatten(p) : p))]);
    shiftPins(k + n, -n);
  };

  // пропорции места на странице — рамка в окне кадрирования такая же
  const cropAspect = (page: number, slot: number) => {
    const p = pages[page];
    const def = layoutOf(p.layout);
    const r = (p.slots ?? def.slots)[slot];
    if (!r) return 1;
    const spread = isSpread(p.layout);
    const b = slotBox(def, r, pageW, spread ? pageW / 2 : pageH);
    // фото внутри рамки (у полароида поле снизу шире) — пропорции без полей
    const { inset } = frameGeometry(p.frame, b.width, b.height, def.bleed);
    return (b.width - inset.left - inset.right) / (b.height - inset.top - inset.bottom);
  };
  // рамка фото: для этой страницы или «ко всем страницам» (один шаг истории)
  const setFrame = (page: number, frame: FrameId, all: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    record();
    setMenu(null);
    mutate((list) => list.map((p, k) => (all || k === page ? { ...p, frame: frame === 'none' ? undefined : frame } : p)));
    setNotice(all ? `Рамка «${FRAMES.find((f) => f.id === frame)?.name}» — на всех страницах` : null);
  };
  const setLayout = (id: string) => {
    if (!menu) return;
    const page = menu.page;
    const have = pages[page].photos.filter(Boolean).length;
    const missing = slotsOf(id) - have - source.length;
    if (params.projectId && missing > 0) {
      setMenu(null);
      setNeedPhotos({ page, layout: id, slot: menu.slot, need: missing });
      return;
    }
    editPage(page, withLayout(pages[page], id, menu.slot, source), `Макет: ${layoutOf(id).name.toLowerCase()}`);
    // макет с подписью — сразу просим текст и место подписи
    if (layoutOf(id).caption) setTimeout(() => setCaptionFor(page), 280);
  };
  // не хватает фото на макет: добрать из галереи (новые встают в рамки) или оставить пустые рамки
  const fillFromGallery = async () => {
    if (!needPhotos) return;
    const { page, layout, slot } = needPhotos;
    setNeedPhotos(null);
    const inBook = pages.flatMap((pg) => pg.photos).filter((x): x is string => typeof x === 'string');
    const picked = await pickPhotos(inBook);
    if (!picked || !picked.fresh.length) return;
    editPage(page, withLayout(pages[page], layout, slot, [...source, ...picked.fresh]), `Макет: ${layoutOf(layout).name.toLowerCase()}`);
  };
  const keepEmpty = () => {
    if (!needPhotos) return;
    const { page, layout, slot } = needPhotos;
    setNeedPhotos(null);
    editPage(page, withLayout(pages[page], layout, slot, source), 'Пустые рамки — заполните перед заказом');
  };
  // редактор подписи страницы
  const [captionFor, setCaptionFor] = useState<number | null>(null);
  // макет без подписи с тем же числом фото — пустая подпись не занимает место на странице
  const plainLayout = (layout: string) => (layoutOf(layout).caption ? SIMPLE[Math.min(4, Math.max(1, slotsOf(layout)))] : layout);
  const saveCaption = (page: number, text: string, layout: string, font: string, look?: CaptionLook) => {
    const p = pages[page];
    const v = text.trim();
    if (!v) {
      // подпись не написали — страница снова обычная
      editPage(page, { ...withLayout(p, plainLayout(layout), 0, source), caption: undefined, captionFont: undefined, captionLook: undefined, fx: p.fx }, 'Без подписи');
    } else {
      editPage(page, { ...withLayout(p, layout, 0, source), caption: v, captionFont: font, captionLook: look, fx: p.fx }, 'Подпись сохранена');
    }
    setCaptionFor(null);
  };
  // закрыли редактор, а на странице макет с подписью без текста (например, только что выбрали его) — убираем пустое место
  const closeCaption = () => {
    if (captionFor === null) return;
    const p = pages[captionFor];
    if (layoutOf(p.layout).caption && !p.caption) {
      editPage(captionFor, { ...withLayout(p, plainLayout(p.layout), 0, source), fx: p.fx }, 'Без подписи');
    }
    setCaptionFor(null);
  };
  const commentHere = () => {
    if (!menu) return;
    setDraft({ id: nextPin.current++, page: menu.page, x: menu.x, y: menu.y, text: '', fixed: false });
    setMenu(null);
  };
  const [notice, setNotice] = useState<string | null>(null);
  const [tariffOpen, setTariffOpen] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);
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
    // всё, что поправил ИИ, — один шаг: ↶ возвращает книгу и замечания как было до «Исправить»
    record();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFixing(true);
    const todo = [...open];
    void (async () => {
      // каждое замечание → одна команда (сервер: модель или правила; нет связи — правила здесь)
      const cmds = await Promise.all(todo.map(async (pin) => (await understandEdit(pin.text))?.command ?? localCommand(pin.text)));
      // свободные фото книги (нигде не стоят); взятое одним замечанием второй раз не отдаём
      const used = new Set(pages.flatMap((pg) => pg.photos).filter(Boolean).map(String));
      const pool = [...source];
      // есть ли люди на фото: в своей книге — по лицам, найденным сервером; в демо-книге — по списку
      const hasPeople = (k: Pic): boolean | undefined => {
        const n = facesOf(String(k));
        if (n !== undefined) return n > 0;
        return params.projectId ? undefined : PEOPLE.includes(k);
      };
      const take = (want: Want) => {
        const i = pool.findIndex((k) => !used.has(String(k)) && (want === 'any' || hasPeople(k) === (want === 'people')));
        if (i < 0) return undefined;
        const [k] = pool.splice(i, 1);
        used.add(String(k));
        return k;
      };
      const next = [...pages];
      const done = new Set<number>();
      const notUnderstood: string[] = [];
      todo.forEach((pin, i) => {
        const pg = next[pin.page];
        if (!pg) return;
        const res = applyCommand(pg, cmds[i], slotAt(pg.layout, pin.x, pin.y, pg.slots), take, hasPeople);
        if ('page' in res) {
          next[pin.page] = res.page;
          done.add(pin.id);
        } else notUnderstood.push(`«${pin.text}» — ${res.why}`);
      });
      setBook(next);
      // вкус человека для следующих книг (notes/25, раздел 9)
      if (cmds.some((c) => c.action === 'enlarge')) addTaste('крупные фото');
      if (cmds.some((c) => c.action === 'fewer_people')) addTaste('меньше селфи');
      if (cmds.some((c) => c.action === 'more_landscapes')) addTaste('больше пейзажей');
      // выполненные — «исправлено»; непонятые остаются открытыми, и человек видит почему
      setPins((ps) => ps.map((p) => (done.has(p.id) ? { ...p, fixed: true } : p)));
      setFixing(false);
      if (notUnderstood.length) setNotice(notUnderstood.length === 1 ? `Не получилось: ${notUnderstood[0]}` : `Не получилось ${notUnderstood.length} замечаний — нажмите на точку и уточните`);
      Haptics.notificationAsync(done.size ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    })();
  };

  // перед заказом — проверка книги: пустые рамки, разрешение, смаз, скриншоты (сервер отвечает не дольше 3 с)
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [checking, setChecking] = useState(false);
  // нечётное число страниц: последняя страница разворота останется пустой, а разворот уже оплачен — спрашиваем один раз
  const [oddAsk, setOddAsk] = useState(false);
  const order = async (oddOk = false) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (pagesN % 2 && !oddOk) return setOddAsk(true);
    setOddAsk(false);
    setChecking(true);
    const pid = params.projectId;
    const server = pid && serverBook(pid) ? await Promise.race([checkOnServer(pid).catch(() => ({})), new Promise<Record<string, never>>((r) => setTimeout(() => r({}), 3000))]) : {};
    setChecking(false);
    const found = findIssues(pages, fmt, server);
    if (found.length) return setIssues(found);
    goCheckout();
  };
  const showPage = (k: number) => {
    setIssues(null);
    scroll.current?.scrollTo({ y: k * step, animated: true });
  };
  const goCheckout = () => {
    setIssues(null);
    orderNow({ projectId: id, title, tariff, tariffName: t.name, format: fmt, pages: pagesN, finish: 'Глянец', price, readyBy: t.readyBy, cover: front ?? 'night-window' });
    router.push('/checkout');
  };

  return (
    // фон страниц — всем PageView и подписям (лента, сетка порядка, окно размеров)
    <PageBgContext.Provider value={PAGE_BG[bg]}>
    <PageDecoContext.Provider value={fromServer?.deco ?? 'none'}>
    <View style={[s.screen, { paddingTop: insets.top + 6 }]}>
      <StatusBar style="dark" />
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          {renaming ? (
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              autoFocus
              selectTextOnFocus
              maxLength={TITLE_MAX}
              returnKeyType="done"
              onSubmitEditing={finishRename}
              onBlur={finishRename}
              style={[s.title, s.titleInput]}
              accessibilityLabel="Название книги"
            />
          ) : (
            <Tap onPress={startRename} accessibilityRole="button" accessibilityLabel={`Название: ${title}. Нажмите, чтобы изменить`}>
              {/* карандаш — в строке текста, сразу после последнего слова (отдельным элементом справа он
                  отрывался от названия, когда оно переносилось на вторую строку) */}
              <Text style={s.title} numberOfLines={2}>
                {title}
                {' '}
                <View style={s.titlePen}>
                  <PencilSimpleIcon size={13} color={colors.mut} weight="bold" />
                </View>
              </Text>
            </Tap>
          )}
          <Text style={s.sub}>
            стр. {Math.min(at + 1, pagesN)} из {pagesN}
            {pins.length ? ` · замечаний ${pins.length}` : ''}
          </Text>
        </View>
        {/* история правок: назад и вперёд — фото, макеты, подписи, страницы, обложка, название, тариф */}
        <View style={s.history}>
          <Tap style={[s.close, !past.length && { opacity: 0.35 }]} disabled={!past.length} onPress={back} hitSlop={6} accessibilityRole="button" accessibilityLabel="Назад: отменить последнюю правку" accessibilityState={{ disabled: !past.length }}>
            <ArrowUUpLeftIcon size={18} color={colors.fg} weight="bold" />
          </Tap>
          <Tap style={[s.close, !future.length && { opacity: 0.35 }]} disabled={!future.length} onPress={forward} hitSlop={6} accessibilityRole="button" accessibilityLabel="Вперёд: вернуть отменённую правку" accessibilityState={{ disabled: !future.length }}>
            <ArrowUUpRightIcon size={18} color={colors.fg} weight="bold" />
          </Tap>
        </View>
        <Tap style={s.close} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть — книга останется в черновиках">
          <XIcon size={18} color={colors.fg} weight="bold" />
        </Tap>
      </View>

      {/* тариф — сверху и всегда на виду: до выбора внизу книги человек может не долистать */}
      <TariffBar
        tariff={tariff}
        format={format}
        pagesN={pagesN}
        onTariff={changeTariff}
      />

      <ScrollView
        ref={scroll}
        contentContainerStyle={[s.list, { paddingBottom: 24 }]}
        contentOffset={{ x: 0, y: Number(params.start ?? 0) * step }}
        showsVerticalScrollIndicator={false}
        // пока тащат страницу, лента сама не листается пальцем (прокрутка у края — FeedDrag)
        scrollEnabled={!dragging}
        scrollEventThrottle={16}
        onScroll={(e) => {
          scrollY.set(e.nativeEvent.contentOffset.y);
          const n = Math.max(0, Math.min(pagesN - 1, Math.round(e.nativeEvent.contentOffset.y / step)));
          if (n !== at) setAt(n);
        }}
        onMomentumScrollEnd={(e) => remember(Math.round(e.nativeEvent.contentOffset.y / step))}
        onScrollEndDrag={(e) => remember(Math.round(e.nativeEvent.contentOffset.y / step))}>
        {/* как исправить — одной строкой над книгой */}
        <View style={s.tip}>
          <HandTapIcon size={16} color={colors.mut} weight="bold" />
          <Text style={s.tipText} numberOfLines={1}>Нажмите на фото, чтобы изменить</Text>
          {/* стикер на страницу — наборы по темам */}
          <Tap onPress={() => setStickerOpen(true)} hitSlop={8} style={s.tipOrder} accessibilityRole="button" accessibilityLabel="Добавить стикер на страницу">
            <StickerIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
          {/* фон страниц всей книги */}
          <Tap onPress={() => setBgOpen(true)} hitSlop={8} style={s.tipOrder} accessibilityRole="button" accessibilityLabel="Фон страниц">
            <View style={[s.bgDot, { backgroundColor: PAGE_BG[bg] }]} />
          </Tap>
          {/* сетка всех страниц — удобнее ленты в толстой книге */}
          <Tap onPress={openOrder} hitSlop={8} style={s.tipOrder} accessibilityRole="button" accessibilityLabel="Порядок страниц: все страницы сеткой">
            <SquaresFourIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
          <Tap onPress={() => setHint(true)} hitSlop={10} style={s.tipHelp} accessibilityRole="button" accessibilityLabel="Как это работает">
            <Text style={s.tipHelpText}>?</Text>
          </Tap>
        </View>

        {/* при первом открытии книги: страницы можно переставлять прямо здесь (раньше об этом нигде не говорилось) */}
        {dragTip ? (
          <Animated.View entering={FadeInDown.duration(260)} exiting={FadeOut.duration(180)} style={s.dragTip}>
            <HandGrabbingIcon size={22} color={colors.coralAction} weight="bold" />
            <View style={{ flex: 1 }}>
              <Text style={s.dragTipTitle}>Порядок страниц</Text>
              <Text style={s.dragTipText}>Зажмите страницу и перетащите на новое место</Text>
            </View>
            <Tap onPress={closeDragTip} hitSlop={10} style={s.close} accessibilityRole="button" accessibilityLabel="Понятно, закрыть подсказку">
              <XIcon size={14} color={colors.fg} weight="bold" />
            </Tap>
          </Animated.View>
        ) : null}

        {opening ? (
          <View style={s.opening} accessibilityLiveRegion="polite">
            {openFailed ? (
              <>
                <Text style={s.openingText}>Не получилось открыть книгу — проверьте интернет</Text>
                <Tap style={[s.save, { flex: 0, alignSelf: 'center', paddingHorizontal: 24 }]} onPress={() => {
                    setOpenFailed(false);
                    setOpenTry((x) => x + 1);
                  }} accessibilityRole="button">
                  <Text style={s.saveText}>Попробовать ещё раз</Text>
                </Tap>
              </>
            ) : (
              <ThinkingLine text="Открываем книгу…" style={s.openingText} />
            )}
          </View>
        ) : (
        <>
        {/* обложка — первой и отдельно: задняя сторона | корешок | лицевая с фото и названием; не переставляется */}
        <View style={{ gap: 8 }}>
          <View style={s.pageLabel}>
            <Text style={s.pageNum}>Обложка</Text>
          </View>
          <Tap onPress={() => setCoverOpen(true)} accessibilityRole="button" accessibilityLabel="Обложка. Нажмите, чтобы выбрать фото и надпись">
            <CoverView photo={front} back={cover.back} frontCrop={cover.frontCrop} backCrop={cover.backCrop} wrap={cover.wrap} title={cover.title ? title : undefined} w={pageW} pageAspect={pageW / pageH} />
          </Tap>
        </View>

        {/* страницы: зажать и тащить прямо в ленте — остальные расступаются (components/feedDrag.tsx) */}
        <FeedDrag
          count={units.length}
          gap={GAP}
          scrollY={scrollY}
          edges={{ top: insets.top + 120, bottom: winH - insets.bottom - 90 }}
          scrollBy={(dy) => scroll.current?.scrollTo({ y: Math.max(0, scrollY.get() + dy), animated: false })}
          onLock={setDragging}
          onDrop={applyOrder}>
        {units.map((u, ui) => {
          // разворот на две страницы — одна единица: рисуется по первой странице, двигается целиком
          const k = u[0];
          const p = pages[k];
          const spread = isSpread(p.layout);
          const cw = pageW;
          const ch = spread ? pageW / 2 : pageH;
          // далеко от экрана — пустой блок той же высоты, без фото: книга на 100 фото, нарисованная целиком,
          // забирала у телефона всю память (iOS закрывал приложение). Фото появляются за несколько страниц до экрана.
          if (k < at - NEAR_BEFORE || k > at + NEAR_AFTER) {
            return (
              <DragUnit key={k} index={ui}>
                <View style={{ height: 28 + ch }} />
              </DragUnit>
            );
          }
          const mine = pins.filter((x) => x.page === k);
          const fixedHere = mine.length > 0 && mine.every((x) => x.fixed);
          return (
            <DragUnit key={k} index={ui}>
            <View style={{ gap: 8 }}>
              <View style={s.pageLabel}>
                <Text style={s.pageNum}>{spread ? `стр. ${k + 1}–${k + 2} · на разворот` : `стр. ${k + 1}`}</Text>
                {spread && tariff === 'lite' ? <Text style={s.seamNote}>шов по центру · в Classic и Premium без шва</Text> : null}
                {fixedHere ? (
                  <Animated.View entering={FadeIn.duration(250)} style={s.fixedTag}>
                    <CheckIcon size={11} color="#fff" weight="bold" />
                    <Text style={s.fixedText}>исправлено</Text>
                  </Animated.View>
                ) : null}
              </View>
              <View>
                <PageView page={p} w={cw} h={ch} dim={fixing && mine.some((x) => !x.fixed)} picked={menu?.page === k ? menu.slot : undefined} seam={spread && tariff === 'lite'} liveStickers />
                {/* слой касаний поверх всей страницы: координаты — от края страницы, а не от фото под пальцем */}
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={(e) => !dragging && tapPage(k, e, cw, ch)}
                  // долгое нажатие ловит перетаскивание (DragUnit): страница приподнимается, и её можно тащить
                  accessibilityRole="button"
                  accessibilityLabel={`Страница ${k + 1}. Нажмите на фото, чтобы заменить его, поменять раскладку или оставить замечание. Зажмите и перетащите, чтобы поменять порядок`}
                />
                {/* стикеры: нажать — «меньше / больше / убрать», тянуть — сдвинуть */}
                {p.stickers?.length ? (
                  <StickerLayer
                    stickers={p.stickers}
                    w={cw}
                    h={ch}
                    selected={stickerSel?.page === k ? stickerSel.i : null}
                    onSelect={(i) => setStickerSel(i === null ? null : { page: k, i })}
                    onChange={(next) => editStickers(k, next)}
                  />
                ) : null}
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
            </DragUnit>
          );
        })}
        </FeedDrag>

        {/* добавить страницу в конец: цена за разворот — видно сразу, платно или бесплатно */}
        <Tap style={s.addPage} onPress={() => insertPage(pagesN)} accessibilityRole="button" accessibilityLabel={`Добавить страницу, ${addPrice}`}>
          <PlusIcon size={18} color={colors.coralAction} weight="bold" />
          <Text style={s.addPageText}>Страница</Text>
          <Text style={s.addPagePrice} numberOfLines={1}>· {addPrice}</Text>
        </Tap>

        <Final
          pagesN={pagesN}
          fixed={pins.filter((p) => p.fixed).length}
          onMore={() => router.push({ pathname: '/book/[id]', params: { id, format: fmt, pages: String(pagesN) } })}
        />
        </>
        )}
      </ScrollView>

      {/* книга собрана по черновым копиям — копии для печати догружаются, пока человек смотрит */}
      {prints.total > prints.done ? (
        <View style={s.printLine} accessibilityLiveRegion="polite">
          <ThinkingLine text={`Фото для печати: ${prints.done} из ${prints.total}`} style={s.printLineText} />
        </View>
      ) : null}
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
            {/* цена и тариф — нажатие открывает выбор Lite / Classic / Premium */}
            <Tap style={{ flex: 1, minWidth: 0 }} onPress={() => setTariffOpen(true)} accessibilityRole="button" accessibilityLabel={`${t.name}, ${rub(price)}. Сменить тариф`}>
              <Text style={s.barPrice}>{rub(price)}</Text>
              <View style={s.barTariffRow}>
                <Text style={s.barTariff}>{t.name}</Text>
                <CaretDownIcon size={12} color={colors.coralLink} weight="bold" />
                <Text style={[s.barMeta, { flexShrink: 1 }]} numberOfLines={1}> · {fmt} · {pagesN} стр. · печать {PRINT_DAYS} дня</Text>
              </View>
            </Tap>
            <Tap style={s.order} onPress={() => order()} disabled={checking} accessibilityRole="button" accessibilityLabel={`Заказать, ${t.name}, ${rub(price)}`}>
              <Text style={s.orderText}>{checking ? 'Проверяем…' : 'Заказать'}</Text>
            </Tap>
          </>
        )}
      </View>

      {issues ? <PreflightSheet issues={issues} onShow={showPage} onOrder={goCheckout} onClose={() => setIssues(null)} /> : null}

      {tariffOpen ? (
        <TariffSheet
          value={tariff}
          format={format}
          pages={total}
          hasSpreads={pages.some((p) => isSpread(p.layout))}
          onPick={(x) => {
            changeTariff(x);
            setTariffOpen(false);
          }}
          onMore={() => {
            setTariffOpen(false);
            router.push({ pathname: '/book/[id]', params: { id, format: fmt, pages: String(pagesN) } });
          }}
          onClose={() => setTariffOpen(false)}
        />
      ) : null}

      {/* подсказка без действия: например, фото уже есть в книге */}
      {menu ? (
        <PhotoMenu
          page={pages[menu.page]}
          pageN={menu.page + 1}
          slot={menu.slot}
          // сквозной лист: не на последней странице (в Lite будет виден шов — об этом подпись над разворотом)
          canSpread={menu.page < pagesN - 1}
          // в Lite разворотов нет — макеты видны бледными, нажатие объясняет почему
          spreadLocked={tariff === 'lite'}
          onLocked={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            setNotice('Макеты на разворот — только в Classic и Premium. Сменить тариф можно сверху');
          }}
          bottom={insets.bottom}
          onReplace={() => replaceFromGallery().catch(() => {})}
          onRemove={removePhoto}
          onCrop={openCrop}
          onSize={() => {
            setSizeFor(menu.page);
            setMenu(null);
          }}
          onLayout={setLayout}
          onComment={commentHere}
          // после сквозного фото новая страница встаёт за обеими его страницами
          onInsertAfter={() => insertPage(menu.page + (isSpread(pages[menu.page].layout) ? 2 : 1))}
          onDeletePage={() => deletePage(menu.page)}
          onFrame={(fr, all) => setFrame(menu.page, fr, all)}
          canDelete={pagesN - (isSpread(pages[menu.page].layout) ? 2 : 1) >= minPages}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {sizeFor !== null && pages[sizeFor] ? (
        <SizeEditor
          def={layoutOf(pages[sizeFor].layout)}
          slots={pages[sizeFor].slots}
          photos={pages[sizeFor].photos}
          crop={pages[sizeFor].crop}
          aspect={isSpread(pages[sizeFor].layout) ? 2 : pageW / pageH}
          seam={isSpread(pages[sizeFor].layout) && tariff === 'lite'}
          onDone={saveSizes}
          onClose={() => setSizeFor(null)}
        />
      ) : null}

      {stickerOpen ? <StickerPicker first={fromServer?.pack} bottom={insets.bottom} onPick={addSticker} onClose={() => setStickerOpen(false)} /> : null}

      {bgOpen ? (
        <>
          <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setBgOpen(false)} accessibilityRole="button" accessibilityLabel="Закрыть" />
          </Animated.View>
          <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, s.sheetAbs, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 12 + SHEET_TAIL }]}>
            <View style={s.sheetHead}>
              <Text style={[s.sheetTitle, { flex: 1 }]}>Фон страниц</Text>
              <Tap style={s.close} onPress={() => setBgOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть">
                <XIcon size={16} color={colors.fg} weight="bold" />
              </Tap>
            </View>
            <Text style={s.sheetSub}>Для всей книги. Подписи сами станут светлыми на тёмном фоне.</Text>
            <View style={s.bgRow} accessibilityRole="radiogroup">
              {BGS.filter((b) => b.id !== 'auto').map((b) => {
                const on = b.id === bg;
                return (
                  <Tap key={b.id} style={[s.bgPick, on && s.bgPickOn]} onPress={() => changeBg(b.id as PageBg)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Фон: ${b.name}`}>
                    <View style={[s.bgSwatch, { backgroundColor: PAGE_BG[b.id as PageBg] }]} />
                    <Text style={s.bgPickName}>{b.name}</Text>
                  </Tap>
                );
              })}
            </View>
          </Animated.View>
        </>
      ) : null}

      {coverOpen ? (
        <CoverSheet
          cover={cover}
          front={front}
          title={title}
          photos={[...new Set(pages.flatMap((p) => p.photos).filter(Boolean))]}
          bottom={insets.bottom}
          // другое фото — его кадр начинается заново
          onPick={(photo) => saveCoverNow({ ...cover, photo, frontCrop: undefined })}
          onCrop={(side) => {
            setCoverOpen(false);
            setCoverCrop(side);
          }}
          // на всю обложку — другие пропорции, кадр лицевой стороны начинается заново
          onWrap={(on) => saveCoverNow({ ...cover, photo: front, wrap: on, frontCrop: undefined })}
          onGallery={async () => {
            const picked = await pickPhotos([], { multiple: false });
            if (picked?.fresh[0]) saveCoverNow({ ...cover, photo: picked.fresh[0], frontCrop: undefined });
          }}
          onBack={(p) => saveCoverNow({ ...cover, back: p, backCrop: undefined })}
          onBackGallery={async () => {
            const picked = await pickPhotos([], { multiple: false });
            if (picked?.fresh[0]) saveCoverNow({ ...cover, back: picked.fresh[0], backCrop: undefined });
          }}
          onTitle={(on) => saveCoverNow({ ...cover, title: on })}
          onClose={() => setCoverOpen(false)}
        />
      ) : null}

      {oddAsk ? (
        <AskSheet
          title="Последняя страница останется пустой"
          text={`В книге ${pagesN} стр., а печатаем разворотами: у последнего разворота одна сторона без фото. Разворот уже оплачен — страницу можно добавить бесплатно.`}
          yes="Добавить страницу"
          no="Оставить пустой"
          bottom={insets.bottom}
          onYes={() => {
            setOddAsk(false);
            insertPage(pagesN);
          }}
          onNo={() => order(true)}
          onClose={() => setOddAsk(false)}
        />
      ) : null}

      {spreadAsk ? (
        <AskSheet
          title="Фото на разворот сдвинется"
          text={
            spreadAsk.kind === 'insert'
              ? 'После этого места есть фото на весь разворот. Одна новая страница сдвинет его на соседний лист, и половинки окажутся на разных листах.'
              : 'После этой страницы есть фото на весь разворот. Без одной страницы оно сдвинется, и половинки окажутся на разных листах.'
          }
          yes={spreadAsk.kind === 'insert' ? 'Добавить 2 страницы' : 'Удалить и сделать обычной страницей'}
          no={spreadAsk.kind === 'insert' ? 'Добавить 1, разворот сделать обычной страницей' : 'Не удалять'}
          bottom={insets.bottom}
          onYes={() => {
            const a = spreadAsk;
            setSpreadAsk(null);
            if (a.kind === 'insert') insertPages(a.at, pagesN + 2 > BOOK[tariff].max ? 1 : 2, { flattenAfter: pagesN + 2 > BOOK[tariff].max });
            else deletePage(a.at, { flattenAfter: true });
          }}
          onNo={() => {
            const a = spreadAsk;
            setSpreadAsk(null);
            if (a.kind === 'insert') insertPages(a.at, 1, { flattenAfter: true });
          }}
          onClose={() => setSpreadAsk(null)}
        />
      ) : null}

      {needPhotos ? (
        <>
          <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setNeedPhotos(null)} accessibilityRole="button" accessibilityLabel="Закрыть" />
          </Animated.View>
          <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, s.sheetAbs, { bottom: -SHEET_TAIL, paddingBottom: insets.bottom + 12 + SHEET_TAIL }]}>
            <Text style={s.sheetTitle}>Не хватает фото</Text>
            <Text style={s.sheetSub}>
              Для макета «{layoutOf(needPhotos.layout).name}» нужно ещё {needPhotos.need} фото: свободных в книге нет, а одно фото дважды не ставим.
            </Text>
            <Tap style={[s.save, { flex: 0, alignSelf: 'stretch' }]} onPress={() => fillFromGallery().catch(() => {})} accessibilityRole="button">
              <Text style={s.saveText}>Добавить {needPhotos.need} из галереи</Text>
            </Tap>
            <Tap style={[s.chip, { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14 }]} onPress={keepEmpty} accessibilityRole="button">
              <Text style={s.chipText}>Оставить пустые рамки</Text>
            </Tap>
            <Tap style={{ alignItems: 'center', paddingVertical: 10 }} onPress={() => setNeedPhotos(null)} accessibilityRole="button">
              <Text style={[s.chipText, { color: colors.mut }]}>Отмена</Text>
            </Tap>
          </Animated.View>
        </>
      ) : null}

      {orderOpen ? (
        <PageOrder
          aspect={pageW / pageH}
          items={units.map((u) => ({
            key: `p${u[0]}`,
            label: u.length > 1 ? `стр. ${u[0] + 1}–${u[1] + 1}` : `стр. ${u[0] + 1}`,
            wide: u.length > 1,
            render: (w, h) =>
              u.length > 1 ? (
                <View style={{ width: w, height: h, justifyContent: 'center' }}>
                  <PageView page={pages[u[0]]} w={w} h={w / 2} />
                </View>
              ) : (
                <PageView page={pages[u[0]]} w={w} h={h} />
              ),
          }))}
          onDone={applyOrder}
          onClose={() => setOrderOpen(false)}
        />
      ) : null}

      {cropFor && pages[cropFor.page]?.photos[cropFor.slot] ? (
        <CropEditor
          k={pages[cropFor.page].photos[cropFor.slot]}
          aspect={cropAspect(cropFor.page, cropFor.slot)}
          initial={pages[cropFor.page].crop?.[String(pages[cropFor.page].photos[cropFor.slot])]}
          onDone={saveCrop}
          onClose={() => setCropFor(null)}
        />
      ) : null}

      {/* кадр фото на обложке — тот же редактор, что у фото на страницах; пропорции — одна сторона обложки */}
      {coverCrop && (coverCrop === 'front' ? front : cover.back) ? (
        <CropEditor
          k={(coverCrop === 'front' ? front : cover.back) as Pic}
          // одна сторона обложки — как страница; фото на всю обложку — две стороны и корешок (8 pt)
          aspect={coverCrop === 'front' && cover.wrap ? pageW / ((pageW - 8) / 2 / (pageW / pageH)) : pageW / pageH}
          initial={coverCrop === 'front' ? cover.frontCrop : cover.backCrop}
          onDone={(c) => {
            saveCoverNow(coverCrop === 'front' ? { ...cover, photo: front, frontCrop: c } : { ...cover, backCrop: c });
            setCoverCrop(null);
          }}
          onClose={() => setCoverCrop(null)}
        />
      ) : null}

      {captionFor !== null ? (
        <CaptionEditor
          page={pages[captionFor]}
          pageN={captionFor + 1}
          bottom={insets.bottom}
          onSave={(text, layout, font, look) => saveCaption(captionFor, text, layout, font, look)}
          onClose={closeCaption}
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

      {/* уведомления — последними, поверх меню и листов: раньше открытое меню фото их закрывало
          (например, «макеты на разворот — только в Classic и Premium» было не видно) */}
      {notice && !undo ? (
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[s.toast, s.toastTop, { top: insets.top + 8 }]} pointerEvents="none">
          <Text style={[s.toastText, { flex: 1 }]}>{notice}</Text>
        </Animated.View>
      ) : null}
      {/* отмена последней прямой правки */}
      {undo ? (
        <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={[s.toast, s.toastTop, { bottom: insets.bottom + 92 }]}>
          <Text style={s.toastText}>{undo.what}</Text>
          <Tap onPress={undoLast} hitSlop={10} accessibilityRole="button">
            <Text style={s.toastLink}>Отменить</Text>
          </Tap>
        </Animated.View>
      ) : null}
    </View>
    </PageDecoContext.Provider>
    </PageBgContext.Provider>
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
/** Место фото на странице w×h в пикселях: поля страницы и зазоры между фото — как на печати. */
function slotBox(def: LayoutDef, r: Rect, w: number, h: number) {
  const pad = def.bleed ? 0 : 12;
  const gap = def.bleed ? 0 : 8;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return { left: pad + r.x * iw + (r.x > 0 ? gap / 2 : 0), top: pad + r.y * ih + (r.y > 0 ? gap / 2 : 0), width: r.w * iw - (r.x > 0 ? gap / 2 : 0) - (r.x + r.w < 1 ? gap / 2 : 0), height: r.h * ih - (r.y > 0 ? gap / 2 : 0) - (r.y + r.h < 1 ? gap / 2 : 0) };
}

function PageView({ page, w, h, dim, picked, seam, liveStickers }: { page: Page; w: number; h: number; dim?: boolean; picked?: number; seam?: boolean; liveStickers?: boolean }) {
  const deco = usePageDeco();
  const def = layoutOf(page.layout);
  const box = (r: Rect) => slotBox(def, r, w, h);
  // фон листа — из вопросов перед сборкой или выбранный в редакторе (контекст PageBgContext)
  const bg = usePageBg();
  return (
    <View style={[s.page, { width: w, height: h, backgroundColor: bg }, def.bleed && { padding: 0, overflow: 'hidden' }, dim && { opacity: 0.55 }]}>
      {(page.slots ?? def.slots).map((r, i) => {
        const k = page.photos[i];
        const fx = page.fx?.[i] ?? [];
        const b = box(r);
        const crop = k ? page.crop?.[String(k)] : undefined;
        // рамка: внешний слой — поля, линия или скругление; фото — внутри с отступом (data/frames.ts)
        const fr = frameGeometry(page.frame, b.width, b.height, def.bleed);
        const iw = b.width - fr.inset.left - fr.inset.right;
        const ih = b.height - fr.inset.top - fr.inset.bottom;
        return (
          <View key={`${i}-${String(k)}`} style={[{ position: 'absolute' }, b, fr.outer]}>
          <View style={{ position: 'absolute', left: fr.inset.left, top: fr.inset.top, width: iw, height: ih, borderRadius: fr.radius, overflow: 'hidden', backgroundColor: colors.card2 }}>
            {/* кадр, выставленный вручную, важнее «кадра по лицам» от ИИ */}
            {k && crop ? <CroppedImage k={k} crop={crop} w={iw} h={ih} /> : k ? (
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
          </View>
        );
      })}
      {/* сквозной разворот: в Lite по центру виден шов, в Classic и Premium — нет */}
      {seam ? <View pointerEvents="none" style={[s.seam, { left: w / 2 - 6 }]} /> : null}
      {def.caption ? (
        <View style={[{ position: 'absolute', justifyContent: 'center' }, box(def.caption)]}>
          <CaptionView page={page} at={def.captionAt} w={w} over={def.over} />
        </View>
      ) : null}
      {deco === 'few' ? <Corners w={w} h={h} dark={!isLight(bg)} /> : null}
      {/* стикеры поверх всего; в ленте их рисует слой с касаниями (StickerLayer) */}
      {liveStickers ? null : <StaticStickers stickers={page.stickers} w={w} h={h} />}
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
function PhotoMenu({ page, pageN, slot, bottom, canSpread, spreadLocked, onLocked, canDelete, onReplace, onRemove, onCrop, onSize, onLayout, onComment, onInsertAfter, onDeletePage, onFrame, onClose }: { page: Page; pageN: number; slot: number; bottom: number; canSpread: boolean; spreadLocked: boolean; onLocked: () => void; canDelete: boolean; onReplace: () => void; onRemove: () => void; onCrop: () => void; onSize: () => void; onLayout: (id: string) => void; onComment: () => void; onInsertAfter: () => void; onDeletePage: () => void; onFrame: (frame: FrameId, all: boolean) => void; onClose: () => void }) {
  const [frameAll, setFrameAll] = useState(false);
  // фильтр макетов по числу фото: null — все
  const [photosN, setPhotosN] = useState<number | null>(null);
  const { height: winH } = useWindowDimensions();
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
          <MenuBtn icon={<ImagesIcon size={22} color={colors.fg} weight="bold" />} label={k ? 'Заменить из галереи' : 'Добавить фото'} onPress={onReplace} />
          <MenuBtn icon={<CropIcon size={22} color={k ? colors.fg : colors.mut2} weight="bold" />} label="Подвинуть и обрезать" onPress={onCrop} off={!k} />
          <MenuBtn icon={<MinusCircleIcon size={22} color={n === 1 ? colors.mut2 : colors.fg} weight="bold" />} label="Убрать фото" onPress={onRemove} off={n === 1} />
          <MenuBtn icon={<ChatCircleTextIcon size={22} color={colors.fg} weight="bold" />} label="ИИ: исправить или улучшить" onPress={onComment} />
        </View>

        {/* всё ниже прокручивается: меню выросло (макеты, рамки, страница), на маленьком экране не влезало */}
        <ScrollView style={{ maxHeight: winH * 0.5, marginHorizontal: -16 }} contentContainerStyle={s.menuScroll} showsVerticalScrollIndicator={false}>
        {/* размеры фото на странице — тянуть границы между фото (на одно фото менять нечего) */}
        {n > 1 ? (
          <Tap style={s.sizeBtn} onPress={onSize} accessibilityRole="button">
            <ArrowsOutLineHorizontalIcon size={20} color={colors.fg} weight="bold" />
            <Text style={s.sizeBtnText}>Размер фото на странице</Text>
          </Tap>
        ) : null}

        {/* макеты; сверху — сколько фото на странице, чтобы список не превращался в стену */}
        <View style={s.frameHead}>
          <Text style={s.menuLabel}>Макет страницы</Text>
          <View style={s.countRow} accessibilityRole="radiogroup">
            {[null, 1, 2, 3, 4].map((c) => {
              const on = c === photosN;
              return (
                <Tap key={String(c)} style={[s.countChip, on && s.placeOn]} onPress={() => setPhotosN(c)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c ? `Макеты на  фото` : 'Все макеты'}>
                  <Text style={[s.countText, on && { color: '#fff' }]}>{c ?? 'Все'}</Text>
                </Tap>
              );
            })}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.layouts}>
          {LAYOUTS.filter((l) => !l.hidden && (canSpread || l.span !== 2) && (photosN === null || l.slots.length === photosN)).map((l) => {
            const cur = layoutOf(page.layout);
            const on = l.id === page.layout || (!!cur.hidden && !!l.caption && l.slots.length === cur.slots.length);
            // макеты на разворот в Lite видны, но бледные: нажатие объясняет, что они только в Classic и Premium
            const locked = spreadLocked && l.span === 2;
            return (
              <Tap key={l.id} style={[s.layoutBtn, locked && { opacity: 0.38 }]} onPress={() => (locked ? onLocked() : !on && onLayout(l.id))} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: locked }} accessibilityLabel={`Макет: ${l.name}, фото: ${l.slots.length}${locked ? '. Только в Classic и Premium' : ''}`}>
                <View style={[s.layoutThumb, on && s.layoutThumbOn]}>
                  <LayoutIcon def={l} on={on} />
                </View>
                <Text style={[s.layoutName, on && { color: colors.fg, fontFamily: fonts.bold }]} numberOfLines={2}>{l.name}</Text>
              </Tap>
            );
          })}
        </ScrollView>

        {/* рамка фото на этой странице; «Ко всем страницам» — одна рамка на всю книгу */}
        <View style={s.frameHead}>
          <Text style={s.menuLabel}>Рамка</Text>
          <Tap style={[s.frameAll, frameAll && s.placeOn]} onPress={() => setFrameAll((x) => !x)} accessibilityRole="switch" accessibilityState={{ checked: frameAll }}>
            {frameAll ? <CheckIcon size={12} color="#fff" weight="bold" /> : null}
            <Text style={[s.frameAllText, frameAll && { color: '#fff' }]}>Ко всем страницам</Text>
          </Tap>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.layouts}>
          {FRAMES.map((f) => {
            const on = (page.frame ?? 'none') === f.id;
            return (
              <Tap key={f.id} style={s.layoutBtn} onPress={() => (!on || frameAll) && onFrame(f.id, frameAll)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Рамка: ${f.name}`}>
                <View style={[s.layoutThumb, on && s.layoutThumbOn]}>
                  <FrameIcon id={f.id} on={on} />
                </View>
                <Text style={[s.layoutName, on && { color: colors.fg, fontFamily: fonts.bold }]} numberOfLines={2}>{f.name}</Text>
              </Tap>
            );
          })}
        </ScrollView>

        {/* сама страница: вставить пустую после неё или удалить (не меньше минимума тарифа) */}
        <View style={s.pageActions}>
          <Tap style={s.pageAction} onPress={onInsertAfter} accessibilityRole="button" accessibilityLabel="Вставить пустую страницу после этой">
            <FilePlusIcon size={18} color={colors.fg} weight="bold" />
            <Text style={s.pageActionText}>Вставить страницу после</Text>
          </Tap>
          <Tap style={[s.pageAction, !canDelete && { opacity: 0.45 }]} disabled={!canDelete} onPress={onDeletePage} accessibilityRole="button" accessibilityLabel="Удалить страницу">
            <TrashIcon size={18} color={colors.coralAction} weight="bold" />
            <Text style={[s.pageActionText, { color: colors.coralAction }]}>Удалить страницу</Text>
          </Tap>
        </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

/** Схема рамки: маленькое фото в своей рамке (как в макетах — серым прямоугольником). */
function FrameIcon({ id, on }: { id: FrameId; on: boolean }) {
  const W = 34;
  const H = 40;
  const fr = frameGeometry(id, W, H);
  return (
    <View style={[{ width: W, height: H }, fr.outer, id === 'mat' || id === 'polaroid' ? { backgroundColor: '#fff' } : null]}>
      <View style={{ position: 'absolute', left: fr.inset.left, top: fr.inset.top, right: fr.inset.right, bottom: fr.inset.bottom, borderRadius: fr.radius, backgroundColor: on ? colors.coralAction : colors.mut2 }} />
    </View>
  );
}

/**
 * Подпись на странице: каждая строка своим размером (стиль, общий размер, размер строки — data/captionLook.ts) и цветом.
 * Светлый цвет на белой странице не читается — подкладываем полупрозрачную тёмную плашку.
 */
function CaptionView({ page, at, w, over }: { page: Page; at?: CaptionAt; w: number; over?: boolean }) {
  const bg = usePageBg();
  const side = at === 'left' || at === 'right';
  const look = page.captionLook;
  if (!page.caption) {
    const hint = <Text style={[s.caption, side && { textAlign: at === 'left' ? 'right' : 'left', fontSize: 12 }, { color: over ? '#FFFFFF' : colors.mut2 }]} numberOfLines={2}>Нажмите, чтобы подписать</Text>;
    // на фото серую подсказку не видно — тоже на плашке
    return over ? <View style={[s.captionPlate, { alignSelf: 'center' }]}>{hint}</View> : hint;
  }
  // подпись поверх фото («Подпись на фото») — по умолчанию белая на тёмной плашке
  const color = look?.color ?? (over ? '#FFFFFF' : defaultColorOn(bg));
  // цвет сливается с фоном страницы — плашка: под светлый текст тёмная, под тёмный — светлая
  const plate = over ? (isLight(color) ? s.captionPlate : s.captionPlateLight) : poorOn(look?.color, bg) ? (isLight(color) ? s.captionPlate : s.captionPlateLight) : null;
  const lines = captionText(page.caption, look).split('\n');
  return (
    <View style={[plate, side ? { alignSelf: 'stretch' } : { alignSelf: 'center', maxWidth: '100%' }]}>
      <Text style={[s.caption, captionFontStyle(page.captionFont), side && { textAlign: at === 'left' ? 'right' : 'left' }, { color }]} numberOfLines={side ? 6 : 2}>
        {lines.map((ln, i) => {
          const fs = lineSize(look, i, w, side);
          return (
            <Text key={i} style={{ fontSize: fs, lineHeight: Math.round(fs * 1.3) }}>
              {ln}
              {i < lines.length - 1 ? '\n' : ''}
            </Text>
          );
        })}
      </Text>
    </View>
  );
}

/**
 * Обложка разворотом, как её печатают: задняя сторона | корешок | лицевая. На лицевой — фото во всю сторону
 * и название внизу (если включено). pageAspect — ширина к высоте одной стороны (как у страниц книги).
 */
function CoverView({ photo, back, frontCrop, backCrop, wrap, title, w, pageAspect }: { photo?: Pic; back?: Pic; frontCrop?: Crop; backCrop?: Crop; wrap?: boolean; title?: string; w: number; pageAspect: number }) {
  const spine = 8;
  const side = (w - spine) / 2;
  const h = side / pageAspect;
  // фото стороны: свой кадр («Подвинуть и обрезать»), если выставили, — иначе по центру
  const shot = (k: Pic, crop?: Crop, ww = side) => (crop ? <CroppedImage k={k} crop={crop} w={ww} h={h} /> : <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />);
  if (wrap && photo) {
    // одно фото на всю обложку; корешок — лёгкой тенью поверх, название — на лицевой половине
    return (
      <View style={[s.cover, { width: w, height: h, overflow: 'hidden' }]}>
        {shot(photo, frontCrop, w)}
        <View style={[s.coverSpine, { position: 'absolute', left: side, top: 0, bottom: 0, width: spine, backgroundColor: 'rgba(0,0,0,0.12)' }]} />
        {title ? (
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={[s.coverShade, { left: side + spine }]}>
            <Text style={s.coverTitle} numberOfLines={2}>{title}</Text>
          </LinearGradient>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[s.cover, { width: w, height: h }]}>
      <View style={[s.coverBack, { width: side, overflow: 'hidden' }]}>
        {back ? shot(back, backCrop) : <Text style={s.coverBackText}>задняя сторона</Text>}
      </View>
      <View style={[s.coverSpine, { width: spine }]} />
      <View style={{ width: side, height: h, overflow: 'hidden' }}>
        {photo ? shot(photo, frontCrop) : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card2 }]} />}
        {title ? (
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={s.coverShade}>
            <Text style={s.coverTitle} numberOfLines={2}>{title}</Text>
          </LinearGradient>
        ) : null}
      </View>
    </View>
  );
}

/** Ряд выбора фото для стороны обложки: «Галерея», (у задней — «Пустая»), фото книги; выбранное — с галочкой. */
function CoverPicks({ selected, photos, empty, onPick, onGallery }: { selected?: Pic; photos: Pic[]; empty?: boolean; onPick: (p: Pic | undefined) => void; onGallery: () => Promise<void> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.coverPicks}>
      <Tap style={[s.coverPick, s.coverGallery]} onPress={() => onGallery().catch(() => {})} accessibilityRole="button" accessibilityLabel="Выбрать из галереи">
        <ImagesIcon size={22} color={colors.fg} weight="bold" />
        <Text style={s.coverGalleryText}>Галерея</Text>
      </Tap>
      {empty ? (
        <Tap style={[s.coverPick, s.coverGallery, !selected && s.coverPickOn]} onPress={() => selected && onPick(undefined)} accessibilityRole="radio" accessibilityState={{ selected: !selected }} accessibilityLabel="Без фото">
          <Text style={s.coverGalleryText}>Пустая</Text>
        </Tap>
      ) : null}
      {photos.map((k) => {
        const on = k === selected;
        return (
          <Tap key={String(k)} style={[s.coverPick, on && s.coverPickOn]} onPress={() => !on && onPick(k)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel="Фото из книги">
            <Image source={pic(k)} style={StyleSheet.absoluteFill} contentFit="cover" />
            {on ? (
              <View style={s.coverPickCheck}>
                <CheckIcon size={12} color="#fff" weight="bold" />
              </View>
            ) : null}
          </Tap>
        );
      })}
    </ScrollView>
  );
}

/** Обложка: фото на лицевой и задней стороне (из книги или из галереи) и название на лицевой. Меняется сразу. */
function CoverSheet({ cover, front, title, photos, bottom, onPick, onGallery, onBack, onBackGallery, onCrop, onWrap, onTitle, onClose }: { cover: { photo?: Pic; back?: Pic; title: boolean; wrap?: boolean }; front?: Pic; title: string; photos: Pic[]; bottom: number; onPick: (p: Pic) => void; onGallery: () => Promise<void>; onBack: (p: Pic | undefined) => void; onBackGallery: () => Promise<void>; onCrop: (side: 'front' | 'back') => void; onWrap: (on: boolean) => void; onTitle: (on: boolean) => void; onClose: () => void }) {
  // заголовок стороны и справа — «Подвинуть и обрезать» её фото (у пустой задней стороны — нечего)
  const head = (label: string, side: 'front' | 'back', has: boolean) => (
    <View style={s.frameHead}>
      <Text style={s.menuLabel}>{label}</Text>
      <Tap style={[s.frameAll, !has && { opacity: 0.4 }]} disabled={!has} onPress={() => onCrop(side)} accessibilityRole="button" accessibilityLabel={`${label}: подвинуть и обрезать фото`}>
        <CropIcon size={13} color={colors.fg} weight="bold" />
        <Text style={s.frameAllText}>Подвинуть и обрезать</Text>
      </Tap>
    </View>
  );
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, s.sheetAbs, { bottom: -SHEET_TAIL, paddingBottom: bottom + 12 + SHEET_TAIL }]}>
        <View style={s.sheetHead}>
          <Text style={[s.sheetTitle, { flex: 1 }]}>Обложка</Text>
          <Tap style={s.close} onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть">
            <XIcon size={16} color={colors.fg} weight="bold" />
          </Tap>
        </View>
        {/* одно фото на всю обложку — задняя сторона, корешок и лицевая */}
        <View style={s.coverTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.coverTitleLabel}>Одно фото на всю обложку</Text>
            <Text style={s.sheetSub} numberOfLines={1}>через корешок, с задней стороны на лицевую</Text>
          </View>
          <Switch value={!!cover.wrap} onValueChange={onWrap} trackColor={{ true: colors.coralAction, false: colors.hair }} accessibilityLabel="Одно фото на всю обложку" />
        </View>
        {head(cover.wrap ? 'Фото на всю обложку' : 'Лицевая сторона', 'front', !!front)}
        <CoverPicks selected={front} photos={photos} onPick={(p) => p && onPick(p)} onGallery={onGallery} />
        {cover.wrap ? null : (
          <>
            {head('Задняя сторона', 'back', !!cover.back)}
            <CoverPicks selected={cover.back} photos={photos} empty onPick={onBack} onGallery={onBackGallery} />
          </>
        )}
        <View style={s.coverTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.coverTitleLabel}>Название на обложке</Text>
            <Text style={s.sheetSub} numberOfLines={1}>«{title}»</Text>
          </View>
          <Switch value={cover.title} onValueChange={onTitle} trackColor={{ true: colors.coralAction, false: colors.hair }} accessibilityLabel="Название на обложке" />
        </View>
      </Animated.View>
    </>
  );
}

/** Вопрос снизу: что случится и два ответа; «Отмена» — ничего не менять. */
function AskSheet({ title, text, yes, no, bottom, onYes, onNo, onClose }: { title: string; text: string; yes: string; no: string; bottom: number; onYes: () => void; onNo: () => void; onClose: () => void }) {
  return (
    <>
      <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть" />
      </Animated.View>
      <Animated.View entering={sheetIn} exiting={sheetOut} style={[s.sheet, s.sheetAbs, { bottom: -SHEET_TAIL, paddingBottom: bottom + 12 + SHEET_TAIL }]}>
        <Text style={s.sheetTitle}>{title}</Text>
        <Text style={s.sheetSub}>{text}</Text>
        <Tap style={[s.save, { flex: 0, alignSelf: 'stretch' }]} onPress={onYes} accessibilityRole="button">
          <Text style={s.saveText}>{yes}</Text>
        </Tap>
        <Tap style={[s.chip, { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 14 }]} onPress={onNo} accessibilityRole="button">
          <Text style={s.chipText}>{no}</Text>
        </Tap>
        <Tap style={{ alignItems: 'center', paddingVertical: 10 }} onPress={onClose} accessibilityRole="button">
          <Text style={[s.chipText, { color: colors.mut }]}>Отмена</Text>
        </Tap>
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
/** Длина подписи: две строки на странице (сервер принимает до 300 — с запасом). */
const CAPTION_MAX = 90;
/** Замечание для ИИ — коротко, одной мыслью (сервер принимает до 500). */
const NOTE_MAX = 200;

/**
 * Подпись страницы: текст (свой, «дата и место» или «придумать ИИ») и где она стоит — сверху, снизу, слева, справа.
 * Сверху — живая мини-схема страницы: видно, куда встанет подпись. Лист едет вместе с клавиатурой.
 */
function CaptionEditor({ page, pageN, bottom, onSave, onClose }: { page: Page; pageN: number; bottom: number; onSave: (text: string, layout: string, font: string, look: CaptionLook) => void; onClose: () => void }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const pageBg = usePageBg();
  const [text, setText] = useState(page.caption ?? '');
  const [font, setFont] = useState<string>(page.captionFont ?? 'classic');
  // вид подписи: новая подпись — «Заголовок + подпись» (первая строка крупнее)
  const [look, setLook] = useState<CaptionLook>(page.captionLook ?? { style: 'title' });
  // чей размер двигает ползунок: -1 — весь текст, 0, 1… — отдельная строка
  const [target, setTarget] = useState(-1);
  const linesN = text ? text.split('\n').length : 0;
  const sizeNow = target < 0 ? (look.size ?? 1) : (look.lines?.[target] ?? 1);
  const setSize = (v: number) =>
    setLook((l) => {
      if (target < 0) return { ...l, size: v };
      const lines = [...(l.lines ?? [])];
      while (lines.length <= target) lines.push(null);
      lines[target] = v;
      return { ...l, lines };
    });
  // цвета с фото этой страницы: 2 светлых и 3 тёмных (считает сервер)
  const [fromPhoto, setFromPhoto] = useState<string[]>([]);
  useEffect(() => {
    const first = page.photos.find(Boolean);
    if (!first) return;
    let alive = true;
    photoPalette(String(first))
      .then((p) => alive && setFromPhoto([...p.light.slice(0, 2), ...p.dark.slice(0, 3)]))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [page.photos]);
  const [layout, setLayoutId] = useState(layoutOf(page.layout).caption ? page.layout : 'caption');
  const at = layoutOf(layout).captionAt ?? 'bottom';
  // строк на странице: снизу/сверху — 2, сбоку — 6 (как numberOfLines в PageView); Enter сверх этого не добавляет строку
  const maxLines = at === 'left' || at === 'right' ? 6 : 2;
  const [tooMany, setTooMany] = useState(false);
  const [typing, setTyping] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const change = (v: string) => {
    if (v.split('\n').length > maxLines) {
      setTooMany(true);
      return;
    }
    setTooMany(false);
    setText(v);
    // строку, размер которой двигали, стёрли — ползунок снова для всего текста
    if (target >= v.split('\n').length) setTarget(-1);
  };
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
            <Text style={[s.sheetSub, { flex: 1 }]}>стр. {pageN}</Text>
            {/* закрыть без сохранения — видно и при открытой клавиатуре */}
            <Tap style={s.close} onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Закрыть без сохранения">
              <XIcon size={16} color={colors.fg} weight="bold" />
            </Tap>
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
            <TextInput
              ref={input}
              value={text}
              onChangeText={change}
              maxLength={CAPTION_MAX}
              placeholder="Например: лето у бабушки"
              placeholderTextColor={colors.mut2}
              style={[s.input, captionFontStyle(font)]}
              multiline
              // Enter — новая строка; спрятать клавиатуру — галочка рядом с полем
              submitBehavior="newline"
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              accessibilityLabel="Текст подписи"
            />
            {typing ? (
              <Tap style={s.kbDone} onPress={() => input.current?.blur()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Готово, спрятать клавиатуру">
                <CheckIcon size={16} color="#fff" weight="bold" />
              </Tap>
            ) : null}
          </View>
          {/* подпись — две строки на странице (сбоку — шесть): длиннее не влезет в печать */}
          <Text style={[s.counter, (tooMany || text.length >= CAPTION_MAX) && { color: colors.coralAction }]}>
            {tooMany ? `Тут помещается ${maxLines === 2 ? '2 строки' : '6 строк'}` : `${text.length} / ${CAPTION_MAX}`}
          </Text>

          {/* пока печатают — только текст и готовые варианты; вид подписи — когда клавиатура спрятана (лист иначе не влезает) */}
          {!typing && text ? (
            <ScrollView style={{ maxHeight: winH * 0.42, marginHorizontal: -16 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
              {/* как будет на странице: размер строк и цвет видно сразу */}
              <View style={[s.capPreview, { backgroundColor: pageBg }, poorOn(look.color, pageBg) && { paddingVertical: 10 }]}>
                <CaptionView page={{ ...page, caption: text, captionFont: font, captionLook: look }} at={at === 'left' || at === 'right' ? undefined : at} w={winW - 64} over={layoutOf(layout).over} />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={s.quickRow}>
                {CAPTION_STYLES.map((st) => {
                  const on = (look.style ?? 'plain') === st.id;
                  return (
                    <Tap key={st.id} style={[s.chip, on && s.placeOn]} onPress={() => setLook((l) => ({ ...l, style: st.id as CaptionStyle }))} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                      <Text style={[s.chipText, on && { color: '#fff' }]}>{st.name}</Text>
                    </Tap>
                  );
                })}
              </ScrollView>

              {/* размер: по умолчанию один на весь текст; можно отдельно для строки */}
              <View style={s.sizeHead}>
                <Text style={s.menuLabel}>Размер</Text>
                {linesN > 1 ? (
                  <View style={s.sizeTargets} accessibilityRole="radiogroup">
                    {[-1, ...Array.from({ length: Math.min(linesN, maxLines) }, (_, i) => i)].map((i) => {
                      const on = i === target;
                      return (
                        <Tap key={i} style={[s.sizeTarget, on && s.placeOn]} onPress={() => setTarget(i)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                          <Text style={[s.sizeTargetText, on && { color: '#fff' }]}>{i < 0 ? 'Весь текст' : `${i + 1}-я строка`}</Text>
                        </Tap>
                      );
                    })}
                  </View>
                ) : null}
                {sizeChanged(look) ? (
                  <Tap onPress={() => setLook((l) => ({ ...l, size: undefined, lines: undefined }))} hitSlop={8} accessibilityRole="button">
                    <Text style={s.sizeReset}>По умолчанию</Text>
                  </Tap>
                ) : null}
              </View>
              <Slider value={sizeNow} min={SIZE_MIN} max={SIZE_MAX} onChange={setSize} label={target < 0 ? 'Размер всего текста' : `Размер ${target + 1}-й строки`} />

              {/* цвет: белый и чёрный, три пастельных; ниже — с фото этой страницы */}
              <Text style={s.menuLabel}>Цвет</Text>
              <View style={s.colorRow}>
                {BASE_COLORS.map((c) => (
                  <ColorDot key={c.hex} hex={c.hex} name={c.name} on={look.color === c.hex} onPress={() => setLook((l) => ({ ...l, color: c.hex }))} />
                ))}
              </View>
              {fromPhoto.length ? (
                <View style={s.colorRow}>
                  {fromPhoto.map((hex) => (
                    <ColorDot key={hex} hex={hex} name="Цвет с фото" on={look.color === hex} onPress={() => setLook((l) => ({ ...l, color: hex }))} />
                  ))}
                  <Text style={s.colorNote}>с фото</Text>
                </View>
              ) : null}
              {poorOn(look.color, pageBg) ? <Text style={s.colorWarn}>Этот цвет почти сливается с фоном страницы — подложили полупрозрачную плашку</Text> : null}
            </ScrollView>
          ) : null}

          {/* шрифт подписи: каждая кнопка написана своим шрифтом — видно, как будет на странице */}
          <View style={s.fontRow} accessibilityRole="radiogroup">
            {CAPTION_FONTS.map((f) => {
              const on = f.id === font;
              return (
                <Tap
                  key={f.id}
                  style={[s.fontBtn, on && s.placeOn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setFont(f.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Шрифт: ${f.name}`}>
                  <Text style={[s.fontText, f.style, on && { color: '#fff' }]} numberOfLines={1}>
                    {f.name}
                  </Text>
                </Tap>
              );
            })}
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
          {/* flex: 0 — в столбце кнопка с flex: 1 сжималась до нулевой высоты и её не было видно */}
          <Tap style={[s.save, { flex: 0, alignSelf: 'stretch' }]} onPress={() => onSave(text, layout, font, look)} accessibilityRole="button">
            <Text style={s.saveText}>Готово</Text>
          </Tap>
        </Animated.View>
      </View>
    </>
  );
}

/** Кружок цвета подписи; выбранный — в кольце. Белый — с обводкой, чтобы был виден на светлом листе. */
function ColorDot({ hex, name, on, onPress }: { hex: string; name: string; on: boolean; onPress: () => void }) {
  return (
    <Tap
      style={[s.colorDot, on && s.colorDotOn]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`Цвет: ${name}`}>
      <View style={[s.colorFill, { backgroundColor: hex }, hex.toUpperCase() === '#FFFFFF' && { borderWidth: 1, borderColor: colors.card2 }]} />
    </Tap>
  );
}

const GLOW = ['#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C'] as const;

/**
 * Поле ввода с голосовой подсветкой: пока слушаем — вокруг поля проступает разноцветная рамка и мягкое свечение,
 * которое «дышит» с громкостью. Поле остаётся тем же — текст не прыгает и не перестраивается.
 */
function VoiceField({ listening, level, children }: { listening: boolean; level: SharedValue<number>; children: ReactNode }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.set(withTiming(listening ? 1 : 0, { duration: listening ? 260 : 360, easing: Easing.bezier(0.33, 0, 0.2, 1) }));
  }, [listening, on]);
  // рамка сама чуть прозрачнее — основную краску даёт размытое свечение
  const ring = useAnimatedStyle(() => ({ opacity: on.value * 0.75 }));
  // «дышит» только яркостью — без масштаба, поэтому ничего за полем не шевелится
  const halo = useAnimatedStyle(() => ({ opacity: on.value * (0.55 + level.value * 0.45) }));
  return (
    <View>
      {/* размытое свечение вокруг: цветные тени с большим размытием — края рамки мягко расплываются */}
      <Animated.View pointerEvents="none" style={[s.halo, halo]} />
      {/* цветная рамка */}
      <Animated.View pointerEvents="none" style={[s.ring, ring]}>
        <LinearGradient colors={GLOW} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
      </Animated.View>
      <View style={s.field}>{children}</View>
    </View>
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
  // голос: микрофон — запись (вокруг поля проступает подсветка и «дышит» с настоящей громкостью), ещё раз —
  // распознать на нашем сервере (Whisper) и поставить текст в это же поле, его можно поправить
  const rec = useVoice();
  const [recognizing, setRecognizing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const level = useSharedValue(0);
  useEffect(() => {
    level.set(withTiming(listening ? 0.08 + rec.level * 0.92 : recognizing ? 0.3 : 0, { duration: listening ? 110 : 300 }));
  }, [listening, recognizing, rec.level, level]);
  const voice = async () => {
    if (recognizing) return;
    if (!listening) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      input.current?.blur();
      setVoiceNote(null);
      const err = await rec.start();
      if (err) return setVoiceNote(err);
      setListening(true);
      return;
    }
    setListening(false);
    const uri = await rec.stop().catch(() => null);
    if (!uri) return;
    setRecognizing(true);
    try {
      const said = await speechToText(uri);
      if (!said) return setVoiceNote('Не расслышали — попробуйте ещё раз');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setText((t) => (t.trim() ? `${t.trim()} ${said}` : said).slice(0, NOTE_MAX));
    } catch {
      setVoiceNote('Не получилось распознать — проверьте связь');
    } finally {
      setRecognizing(false);
    }
  };
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
          <VoiceField listening={listening || recognizing} level={level}>
              <TextInput
                accessibilityLiveRegion="polite"
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => onSave(text)}
                ref={input}
                maxLength={NOTE_MAX}
                placeholder={listening ? 'Слушаю… нажмите микрофон, когда закончите' : recognizing ? 'Распознаю…' : 'Например: убери это фото'}
                placeholderTextColor={colors.mut2}
                returnKeyType="done"
                style={s.input}
                accessibilityLabel="Замечание к этому месту"
              />
            {/* голос: распознаёт наш сервер (features.voice) */}
            {features.voice ? (
              <Tap style={[s.mic, listening && s.micOn, recognizing && { opacity: 0.5 }]} disabled={recognizing} onPress={() => void voice()} accessibilityRole="button" accessibilityLabel={listening ? 'Готово, распознать' : 'Сказать голосом'}>
                {listening ? <CheckIcon size={18} color="#fff" weight="bold" /> : <MicrophoneIcon size={18} color="#fff" weight="fill" />}
              </Tap>
            ) : null}
          </VoiceField>
          {voiceNote ? <Text style={s.colorWarn}>{voiceNote}</Text> : null}
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
    </>
  );
}

/** В конце книги: итог и выбор тарифа пилюлями с ценой. */
/** Lite · Classic · Premium сверху: цена за эту книгу и главное отличие для разворотов — шов по центру только у Lite. */
function TariffBar({ tariff, format, pagesN, onTariff }: { tariff: Tariff['id']; format: string; pagesN: number; onTariff: (t: Tariff['id']) => void }) {
  return (
    <View style={s.tbar} accessibilityRole="radiogroup">
      {tariffs.map((t) => {
        const on = t.id === tariff;
        const p = bookPrice(t.id, fitFormat(t.id, format), pagesN, 'Глянец');
        // главное отличие для раскладки: в Lite нет фото на разворот, в Classic и Premium — разворот без шва
        const note = t.id === 'lite' ? 'без разворотов' : 'разворот без шва';
        return (
          <Tap key={t.id} style={[s.tbarItem, on && s.tbarOn]} onPress={() => !on && onTariff(t.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${t.name}, ${rub(p)}, ${note}`}>
            <Text style={[s.tbarName, on && { color: '#fff' }]} numberOfLines={1}>
              {t.name} <Text style={[s.tbarPrice, on && { color: 'rgba(255,255,255,0.9)' }]}>{rub(p)}</Text>
            </Text>
            <Text style={[s.tbarNote, on && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{note}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

/** Конец книги: «Это вся книга». Тариф здесь не выбираем — переключатель всегда висит сверху (TariffBar). */
function Final({ pagesN, fixed, onMore }: { pagesN: number; fixed: number; onMore: () => void }) {
  return (
    <View style={s.final}>
      <View style={s.finalIcon}>
        <CheckIcon size={26} color={colors.tealInk} weight="bold" />
      </View>
      <Text style={s.finalTitle}>Это вся книга</Text>
      <Text style={s.finalSub}>{pagesN} стр. · {fixed ? `исправили ${fixed} ${places(fixed)}` : 'всё как собрал ИИ'}</Text>
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
  history: { flexDirection: 'row', gap: 6 },
  titlePen: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', transform: [{ translateY: 3 }] },
  titleInput: { padding: 0, borderBottomWidth: 2, borderBottomColor: colors.coralAction },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, gap: GAP },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: -8 },
  // текст не растягивается — «?» стоит сразу за ним, а не у края экрана
  tipText: { flexShrink: 1, fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  // «?» — заметный: коралловый кружок, а не серая обводка
  tipHelp: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  tipHelpText: { fontSize: 13, fontFamily: fonts.display, color: '#fff' },
  // не height: строка Manrope 12,5 — около 17 pt, при height: 14 хвост «р» в «стр.» обрезался
  pageLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 20 },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 12, backgroundColor: 'rgba(0,0,0,0.10)' },
  seamNote: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.peachInk },
  pageNum: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.semibold, color: colors.mut, fontVariant: ['tabular-nums'] },
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
  cover: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  coverBack: { backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 },
  coverBackText: { fontSize: 11, fontFamily: fonts.medium, color: colors.mut2 },
  coverSpine: { backgroundColor: 'rgba(0,0,0,0.18)' },
  coverShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 28, paddingBottom: 12 },
  coverTitle: { fontSize: 17, lineHeight: 21, fontFamily: fonts.display, color: '#fff', letterSpacing: -0.3 },
  coverPicks: { gap: 8, paddingHorizontal: 16 },
  coverPick: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  coverPickOn: { borderColor: colors.coralAction },
  coverPickCheck: { position: 'absolute', right: 4, top: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.coralAction, alignItems: 'center', justifyContent: 'center' },
  coverGallery: { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', gap: 2 },
  coverGalleryText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.fg },
  coverTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  coverTitleLabel: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  tipOrder: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  menuScroll: { gap: 12, paddingHorizontal: 16 },
  countRow: { flexDirection: 'row', gap: 4 },
  countChip: { minWidth: 30, height: 28, paddingHorizontal: 9, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.fg },
  frameHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  frameAll: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: colors.card },
  frameAllText: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.fg },
  bgDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.18)' },
  bgRow: { flexDirection: 'row', gap: 8 },
  bgPick: { flex: 1, alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, borderWidth: 2, borderColor: 'transparent' },
  bgPickOn: { borderColor: colors.coralAction },
  bgSwatch: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  bgPickName: { fontSize: 13, fontFamily: fonts.semibold, color: colors.fg },
  opening: { alignItems: 'center', gap: 14, paddingVertical: 80 },
  openingText: { fontSize: 15, fontFamily: fonts.medium, color: colors.mut, textAlign: 'center' },
  dragTip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(35,43,42,0.08)', boxShadow: '0 6px 18px rgba(40,28,20,0.10)' },
  dragTipTitle: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  dragTipText: { fontSize: 13, lineHeight: 17, fontFamily: fonts.regular, color: colors.mut, marginTop: 1 },
  addPage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.coralAction, paddingHorizontal: 16 },
  addPageText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralAction },
  addPagePrice: { flexShrink: 1, fontSize: 13.5, fontFamily: fonts.medium, color: colors.mut },
  pageActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  pageAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 14, backgroundColor: colors.card, paddingHorizontal: 8 },
  pageActionText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.fg, flexShrink: 1 },
  printLine: { paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hair, backgroundColor: colors.bg },
  printLineText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.mut },
  barPrice: { fontSize: 20, lineHeight: 24, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  barTariffRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1, overflow: 'hidden' },
  barTariff: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.coralLink },
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
  fontRow: { flexDirection: 'row', gap: 6 },
  fontBtn: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  fontText: { fontSize: 13.5, color: colors.fg },
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
  capPreview: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 8, minHeight: 44, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.card2 },
  sizeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  sizeTargets: { flexDirection: 'row', gap: 4, flex: 1 },
  sizeTarget: { height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.card, justifyContent: 'center' },
  sizeTargetText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.fg },
  sizeReset: { fontSize: 13, fontFamily: fonts.semibold, color: colors.coralLink, marginLeft: 'auto' },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorDotOn: { borderColor: colors.coralAction },
  colorFill: { width: 26, height: 26, borderRadius: 13 },
  colorNote: { fontSize: 12, fontFamily: fonts.medium, color: colors.mut },
  colorWarn: { fontSize: 12, lineHeight: 16, fontFamily: fonts.medium, color: colors.peachInk },
  captionPlateLight: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 8, paddingVertical: 4 },
  captionPlate: { backgroundColor: 'rgba(29,33,32,0.62)', borderRadius: 8, paddingVertical: 4 },
  // уведомление «… · Отменить/Вернуть» — светлое, как карточки приложения: белое, мягкая тень, коралловая ссылка
  // уведомление поверх всего: над меню фото и листами (они внизу) — поэтому сообщения встают сверху экрана
  toastTop: { zIndex: 50, elevation: 50 },
  toast: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(35,43,42,0.08)', paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 8px 24px rgba(40,28,20,0.14)' },
  toastText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.fg },
  toastLink: { fontSize: 15, fontFamily: fonts.bold, color: colors.coralLink },
  sheetWrap: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sheetTitle: { fontSize: 21, lineHeight: 26, fontFamily: fonts.display, letterSpacing: -0.4, color: colors.fg },
  sheetSub: { fontSize: 13, fontFamily: fonts.medium, color: colors.mut },
  sizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 18, backgroundColor: colors.card },
  sizeBtnText: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.fg },
  counter: { fontSize: 12, fontFamily: fonts.medium, color: colors.mut2, textAlign: 'right', marginTop: -6, paddingHorizontal: 4 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 20, padding: 6, paddingLeft: 14 },
  // галочка рядом с полем подписи: спрятать клавиатуру (Enter в поле — новая строка)
  kbDone: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.tealInk, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  ring: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: 22 },
  halo: {
    position: 'absolute',
    left: -2,
    right: -2,
    top: -2,
    bottom: -2,
    borderRadius: 22,
    boxShadow: '-10px 0 18px rgba(52,211,153,0.55), 0 -6px 18px rgba(96,165,250,0.5), 0 0 22px rgba(167,139,250,0.6), 0 6px 18px rgba(244,114,182,0.5), 10px 0 18px rgba(251,146,60,0.55)',
  },
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
  tbar: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  tbarItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderRadius: 14, backgroundColor: colors.card, paddingHorizontal: 4, paddingVertical: 6 },
  tbarOn: { backgroundColor: colors.coralAction },
  tbarName: { fontSize: 13.5, lineHeight: 18, fontFamily: fonts.bold, color: colors.fg },
  tbarPrice: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.mut },
  tbarNote: { fontSize: 11, lineHeight: 14, fontFamily: fonts.medium, color: colors.mut },
  link: { fontSize: 15, fontFamily: fonts.semibold, color: colors.coralLink, paddingVertical: 4 },
});
