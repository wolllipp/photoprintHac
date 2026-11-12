/**
 * Главный путь через сервер: фото из галереи → загрузка → проект → сборка (этапы по-настоящему) → страницы → заказ → статус.
 * Экраны не меняются: они берут отсюда данные, а если сервер недоступен — работают на демо, как раньше.
 */
import { API_URL, ApiError, api, authHeaders, ensureRegistered, online } from '@/api/client';
import { layoutOf } from '@/data/layouts';
import { setRemoteSource } from '@/data/photos';

// фото, которое есть только на сервере, показываем по его адресу с токеном в заголовке
setRemoteSource((id) => ({ uri: `${API_URL}/photos/${id}/file`, headers: authHeaders() }));

/** Какой id на сервере у фото с телефона — чтобы при правке не загружать его повторно. */
const idOfUri = new Map<string, string>();
const uriOfId = new Map<string, string>();
const remember = (id: string, uri: string) => {
  idOfUri.set(uri, id);
  uriOfId.set(id, uri);
};

/** Загрузить фото с телефона на сервер (пачками), вернуть их id. Уже загруженные не грузим. */
async function upload(uris: string[]) {
  const todo = uris.filter((u) => !idOfUri.has(u) && !u.startsWith('srv:'));
  for (let i = 0; i < todo.length; i += 8) {
    const batch = todo.slice(i, i + 8);
    const form = new FormData();
    batch.forEach((uri, k) => {
      const name = uri.split('/').pop() || `photo-${i + k}.jpg`;
      const type = /\.png$/i.test(name) ? 'image/png' : /\.heic$/i.test(name) ? 'image/heic' : 'image/jpeg';
      // React Native отправляет файл по адресу на телефоне
      form.append('files', { uri, name, type } as unknown as Blob);
    });
    const res = await api.post<{ id: string }[]>('/photos', form);
    res.forEach((p, k) => remember(p.id, batch[k]));
  }
  return uris.map((u) => (u.startsWith('srv:') ? u.slice(4) : idOfUri.get(u)!));
}

/** Книга, собранная на сервере: id проекта и страницы — какие фото (локальные адреса на телефоне) в каком макете. */
export type ServerPage = { layout: string; photos: string[]; caption?: string; fx?: Record<number, string[]> };
export type ServerBook = { projectId: string; title: string; pages: ServerPage[] };

/** Фото, выбранные в галерее, ждут экрана сборки (параметры навигации для длинного списка не годятся). */
let pending: { uris: string[]; title: string; pages: number } | null = null;
export const setPendingBook = (p: { uris: string[]; title: string; pages: number }) => {
  pending = p;
};
export const takePendingBook = () => {
  const p = pending;
  pending = null;
  return p;
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

/**
 * Собрать книгу на сервере. onStep — номер шага экрана сборки (0–4). Бросает ошибку, если что-то пошло не так:
 * экран сборки тогда доигрывает демо.
 */
export async function buildOnServer(input: { uris: string[]; title: string; pages: number }, onStep: (n: number) => void): Promise<ServerBook> {
  if (!(await online())) throw new Error('сервер недоступен');

  // 1. загрузка — пачками, чтобы не держать в памяти все снимки сразу
  onStep(0);
  const photoIds = await upload(input.uris);

  // 2. проект на Lite 20×20 — у тарифа минимум 24 страницы, сборка его держит
  const products = await api.get<{ code: string; options: { id: string; format: string }[] }[]>('/catalog/products');
  const lite = products.find((p) => p.code === 'lite')?.options.find((o) => o.format === '20x20');
  const project = await api.post<{ id: string }>('/projects', {
    title: input.title,
    photo_ids: photoIds,
    pages: input.pages,
    option_id: lite?.id,
  });

  // 3. сборка: этапы с сервера двигают экран
  const { job_id } = await api.post<{ job_id: string }>(`/projects/${project.id}/build`);
  for (let t = 0; t < 120; t++) {
    const job = await api.get<{ status: string; stage: string | null }>(`/jobs/${job_id}`);
    if (job.stage) onStep(STAGE_STEP[job.stage] ?? 1);
    if (job.status === 'done') break;
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(`сборка: ${job.status}`);
    await sleep(400);
  }

  // 4. страницы: фото — по локальным адресам (сервер отдаёт id), макет — по числу фото
  const book = await loadServerBook(project.id, input.title);
  onStep(4);
  return book;
}

type PagesOut = { pages: { position: number; template: string | null; caption: string | null; fx: Record<string, string[]>; frames: { photo_id: string }[] }[] };

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
    return {
      layout: p.template ?? LAYOUT_BY_COUNT[Math.min(4, Math.max(1, photos.length))],
      photos,
      caption: p.caption ?? undefined,
      fx,
    };
  });
  const book = { projectId, title, pages };
  books.set(projectId, book);
  return book;
}

/** Сохранить правку страницы на сервере: новые фото с телефона сначала загружаются. Ошибку проглатываем — правка уже на экране. */
export async function savePage(projectId: string, position: number, page: ServerPage) {
  const ids = await upload(page.photos);
  const slots = layoutOf(page.layout).slots;
  await api.put(`/projects/${projectId}/pages/${position}`, {
    template: page.layout,
    caption: page.caption ?? null,
    fx: Object.fromEntries(Object.entries(page.fx ?? {}).map(([k, v]) => [k, v])),
    frames: ids.slice(0, slots.length).map((id, i) => ({ photo_id: id, frame: slots[i] })),
  });
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
}) {
  await ensureRegistered();
  const ids = await upload(o.prints.map((p) => p.uri));
  if (o.points > 0) await api.post(`/dev/points?amount=${o.points}`).catch(() => {});
  return api.post<{ id: string; number: number; total: string }>('/orders', {
    product: 'print_chemical', // как на сайте по умолчанию: «на фотобумаге, как в фотоателье»
    format: PRINT_FORMAT[o.format] ?? '10x15',
    delivery: DELIVERY[o.deliveryId] ?? 'europost_pvz',
    pickup: o.pickup,
    payment: o.payment,
    points_to_spend: o.points,
    prints: o.prints.map((p, i) => ({ photo_id: ids[i], qty: p.qty })),
    extras: o.extras ?? [],
    promo_code: o.promo || undefined,
  });
}

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
}) {
  await ensureRegistered();
  // демо: пики живут в приложении — перед заказом переносим на сервер столько, сколько списываем (только DEMO_MODE)
  if (o.points > 0) await api.post(`/dev/points?amount=${o.points}`).catch(() => {});
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
  return api.post<{ id: string; number: number; total: string }>('/orders', body);
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
