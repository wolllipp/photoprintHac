/**
 * Связь с сервером picPac (services/api). Адрес сервера — тот же компьютер, где запущен Expo, порт 8000
 * (берём из адреса Expo, чтобы не прописывать IP руками), или EXPO_PUBLIC_API_URL.
 * Токен: гостевой выдаётся сам при первом запросе (A10), после входа по телефону — токен клиента.
 * Любая ошибка сервера не ломает приложение: вызывающий код откатывается на демо-данные.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const TOKEN_KEY = 'picpac.api.token';
const REGISTERED_KEY = 'picpac.api.registered';
const TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 120_000;

function baseUrl() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const host = (Constants.expoConfig?.hostUri ?? '').split(':')[0];
  return `http://${host || 'localhost'}:8000`;
}
export const API_URL = baseUrl();

let token: string | null = null;
let registered = false;

async function loadToken() {
  if (token) return token;
  token = await AsyncStorage.getItem(TOKEN_KEY);
  registered = (await AsyncStorage.getItem(REGISTERED_KEY)) === '1';
  return token;
}
async function saveToken(t: string, isRegistered: boolean) {
  token = t;
  registered = isRegistered;
  await AsyncStorage.multiSet([
    [TOKEN_KEY, t],
    [REGISTERED_KEY, isRegistered ? '1' : '0'],
  ]);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function raw<T>(method: string, path: string, body?: unknown, auth = true, extra?: Record<string, string>, timeoutMs = TIMEOUT_MS, retried = false): Promise<T> {
  const headers: Record<string, string> = { ...extra };
  if (auth) {
    const t = await ensureToken();
    headers.Authorization = `Bearer ${t}`;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (res.status === 401 && auth) {
      // токен больше не принимается (сервер сменил секрет, база пересоздана): забываем его и один раз повторяем запрос
      // с новым гостевым — иначе первая загрузка фото после обновления сервера падала с «не авторизован»
      await forgetToken(headers.Authorization);
      if (!retried) return raw<T>(method, path, body, auth, extra, timeoutMs, true);
    }
    if (!res.ok) throw new ApiError(res.status, detailText(data?.detail) || res.statusText);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/** detail у FastAPI — строка, а у ошибок проверки (422) — список; берём первую понятную фразу. */
function detailText(d: unknown): string {
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0] && typeof d[0].msg === 'string') return d[0].msg;
  return '';
}

/** Гостевой токен: собирать книгу можно без входа. */
// один запрос гостевого токена на всех: фото грузятся в два потока, и без этого каждый поток завёл бы своего гостя —
// фото разошлись бы по двум аккаунтам, и книга собралась бы не из всех
let guestPending: Promise<string> | null = null;
export async function ensureToken() {
  const t = await loadToken();
  if (t) return t;
  guestPending ??= (async () => {
    try {
      const r = await raw<{ token: string }>('POST', '/auth/guest', {}, false);
      await saveToken(r.token, false);
      return r.token;
    } finally {
      guestPending = null;
    }
  })();
  return guestPending;
}

/** Токен больше не принимается (сервер сменил секрет, база пересоздана): забываем его — следующий запрос получит гостевой. */
async function forgetToken(sent?: string) {
  // другой поток уже получил новый токен — его не трогаем
  if (sent && token && sent !== `Bearer ${token}`) return;
  token = null;
  registered = false;
  await AsyncStorage.multiRemove([TOKEN_KEY, REGISTERED_KEY]).catch(() => {});
}

/** Человек уже вошёл по номеру телефона на этом устройстве? */
export async function isRegistered() {
  await loadToken();
  return registered;
}

/** «29 123-45-67», «+375 29 123-45-67» → «+375291234567» — так номер ждёт сервер. */
export function toServerPhone(input: string) {
  const d = input.replace(/\D/g, '');
  return `+${d.length === 9 ? `375${d}` : d}`;
}

/** Отправить код из SMS на введённый номер. Ответ сервера: на стенде показа — подсказка, что код демо. */
export async function requestCode(phone: string) {
  return raw<{ sent: boolean; demo_code_hint?: string }>('POST', '/auth/otp/request', { phone: toServerPhone(phone) }, false);
}

/**
 * Проверить код, который ввёл человек, — проверяет только сервер. С гостевым токеном: черновики гостя переходят к аккаунту.
 * Разные номера — разные аккаунты.
 */
export async function verifyCode(phone: string, code: string) {
  const r = await raw<{ token: string; user: { id: string; phone: string } }>('POST', '/auth/otp/verify', { phone: toServerPhone(phone), code }, true);
  await saveToken(r.token, true);
  return r.user;
}

/** Кто вошёл и сколько у него пиков — баланс считает только сервер (GET /me). */
export async function fetchMe() {
  return raw<{ id: string; phone: string | null; is_guest: boolean; points: number }>('GET', '/me');
}

/** Ошибка входа — понятной фразой для листа «Номер телефона». */
export function loginErrorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 400) return 'Код не подошёл — проверьте SMS';
    if (e.status === 422) return 'Проверьте номер: +375 и 9 цифр';
    if (e.status === 503) return 'Вход по SMS пока не работает — попробуйте позже';
    if (e.status === 429) return 'Слишком много попыток — подождите минуту';
    return 'Не получилось войти — попробуйте ещё раз';
  }
  return 'Нет связи с сервером — проверьте интернет';
}

/**
 * Перед заказом нужен вход по телефону (заказывать гостю нельзя). Номер и код вводит человек на оформлении
 * (requestCode → verifyCode); здесь только проверяем, что вход уже был.
 */
export async function ensureRegistered() {
  await loadToken();
  if (!registered) throw new ApiError(401, 'Войдите по номеру телефона');
}

export const api = {
  get: <T>(path: string) => raw<T>('GET', path),
  /** загрузка фото: снимки с телефона по 3–10 МБ — ждём дольше обычного запроса, иначе на Wi-Fi обрывается */
  upload: <T>(path: string, form: FormData) => raw<T>('POST', path, form, true, undefined, UPLOAD_TIMEOUT_MS),
  /** заменить файл фото (копия для печати вместо черновой) — так же долго, как загрузка */
  uploadPut: <T>(path: string, form: FormData) => raw<T>('PUT', path, form, true, undefined, UPLOAD_TIMEOUT_MS),
  /** headers — например, Idempotency-Key заказа */
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => raw<T>('POST', path, body ?? {}, true, headers),
  patch: <T>(path: string, body?: unknown) => raw<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => raw<T>('PUT', path, body ?? {}),
};

/** Заголовок с токеном — для картинок с сервера (токен уже загружен первым запросом). */
export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** Сервер доступен? Быстрая проверка, чтобы не ждать таймаута на каждом шаге. */
export async function online() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
