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

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth) {
    const t = await ensureToken();
    headers.Authorization = `Bearer ${t}`;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
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
export async function ensureToken() {
  const t = await loadToken();
  if (t) return t;
  const r = await raw<{ token: string }>('POST', '/auth/guest', {}, false);
  await saveToken(r.token, false);
  return r.token;
}

/**
 * Перед заказом нужен вход по телефону (заказывать гостю нельзя). В демо — код из SMS всегда 0000 (DEMO_MODE на сервере);
 * черновик гостя переходит к аккаунту. В продукте код вводит человек на экране оформления.
 */
export async function ensureRegistered(phone = '+375291234567') {
  await loadToken();
  if (registered) return;
  await raw('POST', '/auth/otp/request', { phone }, false);
  const r = await raw<{ token: string }>('POST', '/auth/otp/verify', { phone, code: '0000' }, true);
  await saveToken(r.token, true);
}

export const api = {
  get: <T>(path: string) => raw<T>('GET', path),
  post: <T>(path: string, body?: unknown) => raw<T>('POST', path, body ?? {}),
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
