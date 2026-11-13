/**
 * Главный путь через сервер: фото из галереи → загрузка → проект → сборка (этапы по-настоящему) → страницы → заказ → статус.
 * Экраны не меняются: они берут отсюда данные, а если сервер недоступен — работают на демо, как раньше.
 */
import { File as FsFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { API_URL, ApiError, api, authHeaders, ensureRegistered, online } from '@/api/client';
import type { BookStyle, Deco, PageBg } from '@/data/bookStyle';
import type { CaptionLook } from '@/data/captionLook';
import { layoutOf } from '@/data/layouts';
import { draftCopy, takenAt, uploadCopy } from '@/data/picked';
import { setRemoteSource } from '@/data/photos';

// фото, которое есть только на сервере, показываем по его адресу с токеном в заголовке
// для экрана — копия 1200 px (сервер делает её один раз): оригиналы по 12 Мпикс вешали редактор
setRemoteSource((id) => ({ uri: `${API_URL}/photos/${id}/file?w=1200`, headers: authHeaders() }));

/** Какой id на сервере у фото с телефона — чтобы при правке не загружать его повторно. */
const idOfUri = new Map<string, string>();
const uriOfId = new Map<string, string>();
const remember = (id: string, uri: string) => {
  idOfUri.set(uri, id);
  uriOfId.set(id, uri);
};

/** Сколько фото в одном запросе и сколько запросов сразу: копии для печати — около 1 МБ, два потока заметно быстрее одного. */
const BATCH = 2;
const PARALLEL = 2;
/** Черновые копии (1200 px) лёгкие — 200–300 КБ: пачки крупнее, потоков больше. */
const DRAFT_BATCH = 4;
const DRAFT_PARALLEL = 3;

/** Часть формы: файл на телефоне — File из expo-file-system (это Blob), в вебе — Blob по адресу картинки. */
async function filePart(file: string) {
  // fetch в Expo SDK 58 не принимает старую часть формы { uri, name, type } («Unsupported FormDataPart implementation»)
  return (Platform.OS === 'web' ? await (await fetch(file)).blob() : new FsFile(file)) as Blob;
}
const fileName = (file: string, k: number) => file.split('/').pop()?.split('?')[0] || `photo-${k}.jpg`;

/**
 * Загрузить фото с телефона на сервер (пачками), вернуть их id. Уже загруженные не грузим. onProgress — сколько из скольких.
 * draft — для быстрой сборки: вместо копии для печати (3000 px, ~1 МБ) уходит копия 1200 px и размер будущей копии
 * для печати; саму копию для печати потом догружает uploadPrints. Без draft — сразу копия для печати.
 */
async function upload(uris: string[], onProgress?: (done: number, total: number) => void, draft = false, drafted: string[] = []) {
  const todo = uris.filter((u) => !idOfUri.has(u) && !u.startsWith('srv:'));
  let done = 0;
  onProgress?.(0, todo.length);
  const size = draft ? DRAFT_BATCH : BATCH;
  const batches: string[][] = [];
  for (let i = 0; i < todo.length; i += size) batches.push(todo.slice(i, i + size));
  const send = async (batch: string[]) => {
    const form = new FormData();
    const mine: string[] = [];
    for (const [k, uri] of batch.entries()) {
      const d = draft ? await draftCopy(uri) : null;
      // на сервер — копия 3000 px (для печати хватает с запасом), а не оригинал 3–10 МБ
      const file = d?.file ?? (await uploadCopy(uri));
      form.append('files', await filePart(file), fileName(file, k));
      // дата съёмки: в сжатой копии EXIF нет, а книга раскладывается по дням
      form.append('taken_at', takenAt(uri) ?? '');
      if (draft) {
        // пусто — фото уже целиком (небольшое), догружать нечего
        form.append('print_w', d ? String(d.printW) : '');
        form.append('print_h', d ? String(d.printH) : '');
        if (d) mine.push(uri);
      }
    }
    const res = await api.upload<{ id: string }[]>('/photos', form);
    res.forEach((p, k) => remember(p.id, batch[k]));
    drafted.push(...mine);
    done += batch.length;
    onProgress?.(done, todo.length);
  };
  const queue = [...batches];
  const worker = async () => {
    for (let b = queue.shift(); b; b = queue.shift()) await send(b);
  };
  const t0 = Date.now();
  await Promise.all(Array.from({ length: Math.min(draft ? DRAFT_PARALLEL : PARALLEL, queue.length) }, worker));
  if (todo.length) console.log(`[загрузка] ${todo.length} фото (${draft ? 'черновые' : 'для печати'}) за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  // drafted — какие фото ушли черновыми: копии для печати догружает тот, кто вызвал, когда книга уже собрана
  // (иначе замена файла на сервере шла бы одновременно со сборкой, которая читает черновики)
  return uris.map((u) => (u.startsWith('srv:') ? u.slice(4) : idOfUri.get(u)!));
}

/**
 * Копии для печати, которые ещё не на сервере (книга собрана по черновым). Догружаются в фоне, пока человек
 * смотрит книгу; заказ ждёт их (waitPrints), а сервер без них заказ не примет.
 */
const printQueue: string[] = [];
let printTotal = 0;
let printDone = 0;
let printRun: Promise<void> | null = null;
const printListeners = new Set<() => void>();
const notifyPrints = () => printListeners.forEach((f) => f());

/** Сколько копий для печати догружено: { done, total }; total 0 — догружать нечего. */
export const printUploads = () => ({ done: printDone, total: printTotal });
export function onPrintUploads(f: () => void) {
  printListeners.add(f);
  return () => {
    printListeners.delete(f);
  };
}

function queuePrints(uris: string[]) {
  printQueue.push(...uris);
  printTotal += uris.length;
  notifyPrints();
  if (!printRun) printRun = runPrints().finally(() => (printRun = null));
}

async function runPrints() {
  const t0 = Date.now();
  const worker = async () => {
    for (let uri = printQueue.shift(); uri; uri = printQueue.shift()) {
      const id = idOfUri.get(uri);
      if (!id) continue;
      // сеть моргнула — пробуем ещё два раза, потом оставляем (сервер не примет заказ, человек увидит причину)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const file = await uploadCopy(uri);
          const form = new FormData();
          form.append('file', await filePart(file), fileName(file, 0));
          await api.uploadPut(`/photos/${id}/file`, form);
          break;
        } catch (e) {
          if (attempt === 2) console.warn('[печать] не догрузили копию для печати:', e instanceof Error ? e.message : String(e));
          else await sleep(1500);
        }
      }
      printDone += 1;
      notifyPrints();
    }
  };
  await Promise.all([worker(), worker()]);
  console.log(`[загрузка] копии для печати: ${printDone} из ${printTotal} за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
}

/** Дождаться копий для печати (перед заказом). */
export async function waitPrints() {
  while (printRun) await printRun;
}

/** Книга, собранная на сервере: id проекта и страницы — какие фото (локальные адреса на телефоне) в каком макете. */
/** crop — ручной кадр фото (components/cropEditor.tsx): фото → центр cx, cy, увеличение z, пропорции a. */
export type ServerPage = {
  layout: string;
  photos: string[];
  caption?: string;
  /** шрифт подписи: classic | plain | bold | hand (data/captionFonts.ts) */
  captionFont?: string;
  /** вид подписи: стиль строк, размер (весь текст и каждая строка), цвет — data/captionLook.ts */
  captionLook?: CaptionLook;
  fx?: Record<number, string[]>;
  crop?: Record<string, { cx: number; cy: number; z: number; a: number }>;
  /** свои размеры фото на странице (components/sizeEditor.tsx); нет — как в макете */
  slots?: { x: number; y: number; w: number; h: number }[];
};
/** Обложка: фото на лицевой стороне (адрес на телефоне или srv:id; нет — первое фото книги) и название на ней. */
export type ServerCover = { photo?: string; title: boolean };
/** bg — фон страниц после сборки (белый, бежевый, тёмный); deco — украшения из вопросов перед сборкой. */
export type ServerBook = { projectId: string; title: string; pages: ServerPage[]; cover?: ServerCover; bg?: PageBg; deco?: Deco };

/** Фото, выбранные в галерее, ждут экрана сборки (параметры навигации для длинного списка не годятся). */
/** tariff — на каком тарифе собрать (по умолчанию Lite; мало фото — человек мог выбрать Classic или Premium). */
type PendingBook = { uris: string[]; title: string; pages: number; tariff?: string; style?: BookStyle };
let pending: PendingBook | null = null;
export const setPendingBook = (p: PendingBook) => {
  pending = p;
};
/**
 * Фото, которые ждут сборки. Не стираем при чтении: экран в режиме разработки создаётся дважды (StrictMode),
 * и второй раз находил пусто — книга собиралась из демо-фото. Стираем, когда книга собралась (clearPendingBook).
 */
export const takePendingBook = () => pending;
export const clearPendingBook = () => {
  pending = null;
};

/** Собранные на сервере книги — для экрана просмотра (по id проекта). */
const books = new Map<string, ServerBook>();
export const serverBook = (projectId?: string) => (projectId ? books.get(projectId) : undefined);
export const isServerProject = (projectId?: string) => !!projectId && books.has(projectId);

/** Этапы сервера → шаги экрана сборки (их там 4). */
const STAGE_STEP: Record<string, number> = { selecting: 1, layout: 2, faces: 3, captions: 3 };

/** Сколько фото в рамках страницы → макет приложения (data/layouts.ts). */
const LAYOUT_BY_COUNT: Record<number, string> = { 1: 'one', 2: 'two-side', 3: 'three', 4: 'four' };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Сборка, которая идёт сейчас: «Остановить» отменяет её на сервере и прекращает опрос. */
let running: { jobId: string | null; stopped: boolean } | null = null;
export async function cancelServerBuild() {
  const r = running;
  if (!r) return;
  r.stopped = true;
  if (r.jobId) await api.post(`/jobs/${r.jobId}/cancel`).catch(() => {});
}

/** Почему сборка не получилась — экран сборки показывает понятную фразу и «Попробовать ещё раз». */
export class BuildError extends Error {
  constructor(public kind: 'offline' | 'timeout' | 'failed' | 'stopped') {
    super(kind);
  }
}

/** Сколько ждём сборку: дольше — считаем, что зависла (сервер перезапустили и т. п.). */
const BUILD_WAIT_MS = 90_000;

/**
 * Собрать книгу на сервере. onStep — номер шага экрана сборки (0–4).
 * Не получилось — BuildError: экран показывает ошибку, а не чужую демо-книгу.
 */
/** Сборка этих же фото уже идёт (экран в режиме разработки запускает эффект дважды) — не грузим фото второй раз. */
let inflight: { input: object; promise: Promise<ServerBook>; steps: BuildStep[] } | null = null;

/** Шаг экрана сборки; up — сколько фото уже загружено (на шаге 0). */
export type BuildStep = (n: number, up?: { done: number; total: number }) => void;

export function buildOnServer(input: PendingBook, onStep: BuildStep): Promise<ServerBook> {
  if (inflight && inflight.input === input) {
    inflight.steps.push(onStep);
    return inflight.promise;
  }
  const steps = [onStep];
  const promise = buildOnce(input, (n, up) => steps.forEach((f) => f(n, up))).finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { input, promise, steps };
  return promise;
}

async function buildOnce(input: PendingBook, onStep: BuildStep): Promise<ServerBook> {
  if (!(await online())) {
    console.warn('[сборка] сервер не ответил на /health:', API_URL);
    throw new BuildError('offline');
  }
  const me = { jobId: null as string | null, stopped: false };
  running = me;
  try {
    return await build(input, onStep, me);
  } catch (e) {
    // настоящая причина — в лог Expo (на экране — понятная фраза)
    console.warn('[сборка] не получилось:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    if (me.stopped) throw new BuildError('stopped');
    if (e instanceof BuildError) throw e;
    // «нет связи» — только когда сеть правда оборвалась (или не дождались ответа); остальное — «не получилось»
    const net = e instanceof Error && (e.name === 'AbortError' || /network|fetch|timed? ?out|connection/i.test(e.message));
    throw new BuildError(!(e instanceof ApiError) && net ? 'offline' : 'failed');
  } finally {
    if (running === me) running = null;
  }
}

async function build(input: PendingBook, onStep: BuildStep, me: { jobId: string | null; stopped: boolean }): Promise<ServerBook> {

  // 1. загрузка — черновые копии 1200 px: книга собирается за секунды, копии для печати догружаются в фоне
  const t0 = Date.now();
  onStep(0);
  const drafted: string[] = [];
  const photoIds = await upload(input.uris, (done, total) => onStep(0, { done, total }), true, drafted);

  // 2. проект на Lite 20×20 — у тарифа минимум 24 страницы, сборка его держит
  const products = await api.get<{ code: string; options: { id: string; format: string }[] }[]>('/catalog/products');
  const option = products.find((p) => p.code === (input.tariff ?? 'lite'))?.options.find((o) => o.format === '20x20');
  const project = await api.post<{ id: string }>('/projects', {
    title: input.title,
    photo_ids: photoIds,
    pages: input.pages,
    option_id: option?.id,
    // ответы перед сборкой (app/options.tsx): какие фото, размер, фон, украшения
    style: input.style,
  });

  // 3. сборка: этапы с сервера двигают экран
  if (me.stopped) throw new BuildError('stopped');
  const { job_id } = await api.post<{ job_id: string }>(`/projects/${project.id}/build`);
  me.jobId = job_id;
  const until = Date.now() + BUILD_WAIT_MS;
  for (;;) {
    if (me.stopped) throw new BuildError('stopped');
    const job = await api.get<{ status: string; stage: string | null }>(`/jobs/${job_id}`);
    if (job.stage) onStep(STAGE_STEP[job.stage] ?? 1);
    if (job.status === 'done') break;
    if (job.status === 'cancelled') throw new BuildError('stopped');
    if (job.status === 'failed') throw new BuildError('failed');
    // не дождались — не открываем пустую книгу, а говорим, что сборка зависла
    if (Date.now() > until) throw new BuildError('timeout');
    await sleep(400);
  }

  // 4. страницы: фото — по локальным адресам (сервер отдаёт id), макет — по числу фото
  const book = await loadServerBook(project.id, input.title);
  // книга собрана — теперь можно менять черновые файлы на копии для печати
  if (drafted.length) queuePrints(drafted);
  console.log(`[сборка] ${input.uris.length} фото: книга готова за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  onStep(4);
  return book;
}

type PagesOut = { style?: { bg?: string; deco?: string } | null; cover?: { photo_id: string | null; title: boolean } | null; pages: { position: number; template: string | null; caption: string | null; caption_font?: string | null; caption_look?: CaptionLook | null; fx: Record<string, string[]>; frames: { photo_id: string; frame?: Record<string, number> }[] }[] };

/**
 * Книга с сервера: страницы с правками (макет, фото, подпись, улучшения). Фото с телефона — по локальному адресу,
 * остальные (например, после перезапуска приложения) — с сервера.
 */
export async function loadServerBook(projectId: string, title = 'Книга'): Promise<ServerBook> {
  const res = await api.get<PagesOut>(`/projects/${projectId}/pages`);
  const pages: ServerPage[] = res.pages.map((p) => {
    const photos = p.frames.map((f) => uriOfId.get(f.photo_id) ?? `srv:${f.photo_id}`);
    const fx: Record<number, string[]> = {};
    Object.entries(p.fx ?? {}).forEach(([k, v]) => (fx[Number(k)] = v));
    // ручной кадр лежит в рамке страницы рядом с её местом (cx, cy, z, a)
    const crop: NonNullable<ServerPage['crop']> = {};
    p.frames.forEach((f, i) => {
      const fr = f.frame;
      if (fr && typeof fr.z === 'number' && typeof fr.cx === 'number') crop[photos[i]] = { cx: fr.cx, cy: fr.cy, z: fr.z, a: fr.a ?? 1 };
    });
    const layout = p.template ?? LAYOUT_BY_COUNT[Math.min(4, Math.max(1, photos.length))];
    // рамки с сервера не такие, как в макете (человек менял размеры или так разложил сервер) — храним их как свои
    const def = layoutOf(layout).slots;
    const rects = p.frames.map((f) => f.frame).filter((fr): fr is Record<string, number> => !!fr && typeof fr.w === 'number');
    const differ = rects.length === def.length && rects.some((fr, i) => ['x', 'y', 'w', 'h'].some((k) => Math.abs((fr[k] ?? 0) - def[i][k as 'x']) > 0.002));
    return {
      layout,
      photos,
      caption: p.caption ?? undefined,
      captionFont: p.caption_font ?? undefined,
      captionLook: p.caption_look ?? undefined,
      fx,
      crop: Object.keys(crop).length ? crop : undefined,
      slots: differ ? rects.map((fr) => ({ x: fr.x ?? 0, y: fr.y ?? 0, w: fr.w, h: fr.h ?? 1 })) : undefined,
    };
  });
  const c = res.cover;
  const cover = c ? { photo: c.photo_id ? (uriOfId.get(c.photo_id) ?? `srv:${c.photo_id}`) : undefined, title: c.title } : undefined;
  const st = res.style ?? undefined;
  const book: ServerBook = { projectId, title, pages, cover, bg: (st?.bg as PageBg | undefined) ?? undefined, deco: (st?.deco as Deco | undefined) ?? undefined };
  books.set(projectId, book);
  return book;
}

/** Страница для сервера: фото → id (новые с телефона уже загружены), рамки макета или свои. */
function pageBody(page: ServerPage, ids: string[]) {
  const slots = page.slots ?? layoutOf(page.layout).slots;
  return {
    template: page.layout,
    caption: page.caption ?? null,
    caption_font: page.caption ? (page.captionFont ?? null) : null,
    caption_look: page.caption ? (page.captionLook ?? null) : null,
    fx: Object.fromEntries(Object.entries(page.fx ?? {}).map(([k, v]) => [k, v])),
    // ручной кадр — в той же рамке: сервер учитывает увеличение при проверке разрешения под печать
    frames: ids.slice(0, slots.length).map((id, i) => ({ photo_id: id, frame: { ...slots[i], ...page.crop?.[page.photos[i]] } })),
  };
}

/**
 * Вся книга разом — после добавления, вставки, удаления или перестановки страниц (номера следующих сдвигаются,
 * по одной странице не сохранить). Пустые места в рамках (фото ещё не выбрано) на сервер не уходят.
 */
export async function savePages(projectId: string, pages: ServerPage[]) {
  const all = pages.flatMap((p) => p.photos.filter(Boolean));
  await upload(all);
  const body = pages.map((p) => pageBody(p, p.photos.filter(Boolean).map((u) => (u.startsWith('srv:') ? u.slice(4) : idOfUri.get(u)!))));
  await api.put(`/projects/${projectId}/pages`, { pages: body });
  const book = books.get(projectId);
  if (book) book.pages = pages;
}

/**
 * Цвета с фото для подписи: 2 светлых и 3 тёмных (считает сервер). Фото ещё не на сервере (демо-снимок) — пусто.
 * Запоминаем: одно и то же фото не спрашиваем дважды.
 */
const paletteOf = new Map<string, Promise<{ light: string[]; dark: string[] }>>();
export function photoPalette(photo: string) {
  const id = photo.startsWith('srv:') ? photo.slice(4) : idOfUri.get(photo);
  if (!id) return Promise.resolve({ light: [], dark: [] });
  let p = paletteOf.get(id);
  if (!p) {
    p = api.get<{ light: string[]; dark: string[] }>(`/photos/${id}/palette`).catch(() => {
      paletteOf.delete(id);
      return { light: [], dark: [] };
    });
    paletteOf.set(id, p);
  }
  return p;
}

/** Новое название книги (его меняют в редакторе, нажав на название). */
export async function renameProject(projectId: string, title: string) {
  await api.patch(`/projects/${projectId}`, { title });
  const book = books.get(projectId);
  if (book) book.title = title;
}

/** Обложка: фото на лицевой стороне и название на ней. */
export async function saveCover(projectId: string, cover: ServerCover) {
  const [id] = cover.photo ? await upload([cover.photo]) : [undefined];
  await api.put(`/projects/${projectId}/cover`, { photo_id: id ?? null, title: cover.title });
  const book = books.get(projectId);
  if (book) book.cover = cover;
}

/** Сохранить правку страницы на сервере: новые фото с телефона сначала загружаются. Ошибку проглатываем — правка уже на экране. */
export async function savePage(projectId: string, position: number, page: ServerPage) {
  const ids = await upload(page.photos);
  // свои размеры фото, если человек их менял, — иначе рамки макета
  await api.put(`/projects/${projectId}/pages/${position}`, pageBody(page, ids));
  const book = books.get(projectId);
  if (book) book.pages[position] = page;
}

/** Замечание сервера к фото (оценка качества под рамку — services/api/app/ai/quality.py). */
export type PhotoWarning = { code: string; text: string; level: string | null };

/**
 * Проверка книги на сервере перед заказом: разрешение под рамку, смазанные фото, скриншоты.
 * Ключ — фото так, как оно стоит в книге приложения (адрес на телефоне или srv:id). Сервер недоступен — пусто.
 */
export async function checkOnServer(projectId: string): Promise<Record<string, PhotoWarning[]>> {
  type Sel = { photos: { photo_id: string; selected: boolean; warnings: { code: string; text: string }[]; quality_level: string | null }[] };
  const res = await api.get<Sel>(`/projects/${projectId}/selection`);
  const out: Record<string, PhotoWarning[]> = {};
  for (const p of res.photos) {
    if (!p.warnings.length) continue;
    out[uriOfId.get(p.photo_id) ?? `srv:${p.photo_id}`] = p.warnings.map((w) => ({ ...w, level: p.quality_level }));
  }
  return out;
}

/**
 * Все фото проекта на сервере — так, как их знает приложение (адрес на телефоне или srv:id).
 * Из них «ИИ: исправить» и смена макета берут замену: в книгу человека не попадают чужие демо-снимки.
 */
export async function projectPhotos(projectId: string): Promise<string[]> {
  type Sel = { photos: { photo_id: string }[] };
  const res = await api.get<Sel>(`/projects/${projectId}/selection`);
  return res.photos.map((p) => uriOfId.get(p.photo_id) ?? `srv:${p.photo_id}`);
}

/** Формат печати в приложении → на сервере. */
const PRINT_FORMAT: Record<string, string> = { '10×15': '10x15', '15×20': '15x20', '20×30': '20x30', '30×45': '30x45' };

/** Заказ фотопечати на сервере: фото загружаются, дальше — как у книги (вход, доставка, оплата, пики, допуслуги, промокод). */
export async function orderPrintsOnServer(o: {
  prints: { uri: string; qty: number }[];
  format: string;
  deliveryId: string;
  pickup?: { title: string; address: string };
  payment: 'card' | 'erip';
  points: number;
  extras?: string[];
  promo?: string;
  /** ключ повтора: тот же ключ — тот же заказ (orderKey) */
  key?: string;
}) {
  await ensureRegistered();
  const ids = await upload(o.prints.map((p) => p.uri));
  return api.post<OrderOut>('/orders', {
    product: 'print_chemical', // как на сайте по умолчанию: «на фотобумаге, как в фотоателье»
    format: PRINT_FORMAT[o.format] ?? '10x15',
    delivery: DELIVERY[o.deliveryId] ?? 'europost_pvz',
    pickup: o.pickup,
    payment: o.payment,
    points_to_spend: o.points,
    prints: o.prints.map((p, i) => ({ photo_id: ids[i], qty: p.qty })),
    extras: o.extras ?? [],
    promo_code: o.promo || undefined,
  }, idem(o.key));
}

/** Что сервер отвечает на заказ: номер, итог и разбивка (её нет у повтора — replayed). */
export type OrderOut = { id: string; number: number; total: string; replayed?: boolean };

/**
 * Ключ повтора заказа (Idempotency-Key, план 1.5): тот же ключ — сервер вернёт уже созданный заказ,
 * второй не создаст (ответ потерялся, человек нажал «Повторить»). Новый ключ — когда поменялось содержимое заказа.
 */
export const orderKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const idem = (key?: string) => (key ? { 'Idempotency-Key': key } : undefined);

/** Способ доставки приложения → код на сервере. */
const DELIVERY: Record<string, string> = { evropochta: 'europost_pvz', courier: 'europost_courier_minsk', belpochta: 'belpost', ems: 'ems' };

/**
 * Заказ на сервере: перед ним — вход по телефону (заказывать гостю нельзя). Возвращает номер и id заказа.
 * Формат приложения «20×20» → «20x20». Ошибку не прячем и формат не подменяем: человек заказывает ровно то, что выбрал,
 * а экран оформления показывает ошибку и «Повторить».
 */
export async function orderOnServer(o: {
  projectId: string;
  tariff: string;
  format: string;
  deliveryId: string;
  pickup?: { title: string; address: string };
  payment: 'card' | 'erip';
  points: number;
  /** допуслуги (подарочная упаковка, «быстрее») и промокод — сервер считает сумму так же, как приложение */
  extras?: string[];
  promo?: string;
  /** ключ повтора: тот же ключ — тот же заказ (orderKey) */
  key?: string;
}) {
  await ensureRegistered();
  // книга собиралась по черновым копиям — в печать идут копии для печати, ждём, пока догрузятся
  await waitPrints();
  // пики списывает сервер со своего баланса (GET /me); приложение их не начисляет
  const body = {
    project_id: o.projectId,
    product: o.tariff,
    format: o.format.replace('×', 'x'),
    delivery: DELIVERY[o.deliveryId] ?? 'europost_pvz',
    pickup: o.pickup,
    payment: o.payment,
    points_to_spend: o.points,
    extras: o.extras ?? [],
    promo_code: o.promo || undefined,
  };
  return api.post<OrderOut>('/orders', body, idem(o.key));
}

/** Ошибка заказа — понятной фразой для экрана оформления. */
export function orderErrorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return 'Нужно войти по номеру телефона ещё раз';
    if (e.status >= 500) return 'Сервер не принял заказ. Деньги не списаны — попробуйте ещё раз';
    return e.message || 'Заказ не оформлен — проверьте данные';
  }
  return 'Нет связи с сервером. Деньги не списаны — проверьте интернет и повторите';
}

/** Этап заказа на сервере → этап в приложении (0 принят · 1 проверен · 2 печать · 3 в пути · 4 готов). */
const ORDER_STAGE: Record<string, number> = {
  accepted: 0,
  layout_checked: 1,
  printing: 2,
  binding: 2,
  handed_to_delivery: 3,
  ready_for_pickup: 4,
  delivered: 4,
};
export async function orderStage(serverId: string) {
  const o = await api.get<{ stage: string }>(`/orders/${serverId}`);
  return ORDER_STAGE[o.stage] ?? 0;
}

/** Обращение в поддержку по заказу на сервере (тема и текст) — номер обращения и срок ответа. */
export async function supportOnServer(serverId: string, topic: string, text: string) {
  return api.post<{ number: number; status: 'open'; sla_hours: number }>(`/orders/${serverId}/support`, { topic, text });
}

/** Фон страниц всей книги — меняют в редакторе. */
export async function setBookBg(projectId: string, bg: PageBg) {
  await api.patch(`/projects/${projectId}`, { bg });
  const book = books.get(projectId);
  if (book) book.bg = bg;
}
