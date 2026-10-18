import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiEnvelope } from '../types';
import { getActiveShopId } from '../lib/shop';
import { cacheGet, cacheKey, cachePut, cacheSearch, withPending } from '../offline/cache';
import { getNetState, patchNetState } from '../offline/network';
import { enqueue, listOps, type OutboxOp } from '../offline/outbox';
import { pathOf, queueRule } from '../offline/policy';
import { getSessionUser } from '../offline/session';
import { announceFailure, announceSuccess } from './feedback';

/**
 * API taban adresi.
 *  - VITE_API_URL doluysa o kullanılır (derleme zamanı; boş string YOK SAYILIR).
 *  - Üretimde (nginx) GÖRELİ '/api/v1' kullanılır: arayüz ve API aynı origin'den
 *    sunulur (nginx '/api' isteklerini backend'e proxy'ler). Böylece port/CORS
 *    sorunu olmaz; yerel ağdaki her cihaz http://<sunucu-ip>/ ile sorunsuz çalışır.
 *  - Geliştirmede (vite dev) backend ayrı portta olduğundan localhost:3000 varsayılır.
 *
 * NOT: Burada `??` DEĞİL `||` kullanılır — üretim imajına VITE_API_URL boş string
 * olarak gömülebildiğinden (`??` boş string'i yakalamaz) login isteği yanlışlıkla
 * nginx'e gidip 405 verebiliyordu.
 */
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1');

const ACCESS_KEY = 'st_access';
const REFRESH_KEY = 'st_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({ baseURL: API_URL });

/** Kuyruktan gönderim / önbellek denetimi için istek işaretleri. */
type StConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  /** Kuyruktaki bir işlemin gönderimi: çevrimdışıysa yeniden kuyruğa girmez. */
  _replay?: boolean;
};

const SAFE_METHODS = new Set(['get', 'head', 'options']);

// Her isteğe: access token (stateless kimlik), seçili dükkân ve yazma
// isteklerinde tekrar anahtarı. Anahtar yapılandırmada kalır: aynı istek
// yeniden denenirse sunucu onu ikinci kez işlemez.
api.interceptors.request.use((config: StConfig) => {
  const token = tokenStore.access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const shopId = getActiveShopId();
  if (shopId && !config.headers['X-Shop-Id']) {
    config.headers['X-Shop-Id'] = shopId;
  }
  if (!SAFE_METHODS.has((config.method ?? 'get').toLowerCase()) && !config.headers['Idempotency-Key']) {
    config.headers['Idempotency-Key'] = newId();
  }
  return config;
});

// Başarılı yanıtlarda zarfı (envelope) açarak doğrudan data döndür.
let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope<unknown>>) => {
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      response.data = response.data.data as never;
    }
    markReachable();
    rememberResponse(response);
    announceSuccess(response);
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as StConfig | undefined;

    // 401 → access token süresi dolmuş olabilir; bir kez yenilemeyi dene.
    if (original && error.response?.status === 401 && !original._retry && tokenStore.refresh) {
      original._retry = true;
      refreshing ??= refreshAccessToken();
      const newAccess = await refreshing;
      refreshing = null;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }

    // Sunucuya (ya da veritabanına) ulaşılamıyor → çevrimdışı yol.
    if (original && isOfflineError(error) && !original._replay) {
      patchNetState({ online: false });
      const fallback = await offlineFallback(original);
      if (fallback) {
        announceSuccess(fallback);
        return fallback;
      }
      const offline = offlineError(original);
      announceFailure(offline, original);
      return Promise.reject(offline);
    }
    if (!original?._replay) announceFailure(error, original);
    return Promise.reject(error);
  },
);

/** Yanıt yok (ağ hatası) ya da ağ geçidi/sunucu geçici olarak yok. */
export function isOfflineError(error: unknown): boolean {
  const e = error as AxiosError;
  if (!e || !e.isAxiosError || e.code === 'ERR_CANCELED') return false;
  if (!e.response) return true;
  return [502, 503, 504].includes(e.response.status);
}

function markReachable(): void {
  if (!getNetState().online) patchNetState({ online: true });
  if (getNetState().fromCache) patchNetState({ fromCache: false });
}

/** Başarılı GET yanıtını cihazda saklar (çevrimdışıyken gösterilir). */
function rememberResponse(response: AxiosResponse): void {
  const config = response.config as StConfig;
  const method = (config.method ?? 'get').toLowerCase();
  const user = getSessionUser();
  if (method !== 'get' || !user || config._replay) return;
  if (config.responseType && config.responseType !== 'json') return;
  const shopId = (config.headers['X-Shop-Id'] as string | undefined) ?? null;
  void cachePut(cacheKey(user, shopId, pathOf(config.url), config.params), response.data);
}

/**
 * Çevrimdışı karşılık: GET için son görülen yanıt; sıraya alınabilen yazma
 * işlemi için kuyruğa ekleyip "kabul edildi" (202) yanıtı. Yeni kayıt açan
 * işlemin yanıtı geçici bir kimlik taşır.
 */
async function offlineFallback(config: StConfig): Promise<AxiosResponse | null> {
  const user = getSessionUser();
  if (!user) return null;
  const method = (config.method ?? 'get').toLowerCase();
  const shopId = (config.headers['X-Shop-Id'] as string | undefined) ?? null;
  const path = pathOf(config.url);

  if (method === 'get') {
    if (config.responseType && config.responseType !== 'json') return null;
    // Bu listeye sıradan eklenen yeni kayıtlar (çevrimdışı açılan müşteri ...).
    const pending = await pendingCreations(user, shopId, path);
    const hit = await cacheGet(cacheKey(user, shopId, path, config.params));
    const data = hit
      ? withPending(hit.data, pending)
      : await cacheSearch(user, shopId, path, config.params, pending);
    if (data === undefined) return null;
    patchNetState({ fromCache: true });
    return { data, status: 200, statusText: 'OK', headers: { 'x-offline-cache': '1' }, config } as AxiosResponse;
  }

  const rule = queueRule(method, config.url);
  const body = parseBody(config.data);
  if (!rule || body === INVALID) return null;
  const tempId = rule.creates ? newId() : undefined;
  const op: OutboxOp = {
    id: String(config.headers['Idempotency-Key'] ?? newId()),
    userId: user,
    shopId,
    method,
    url: path,
    params: config.params,
    body,
    label: rule.label,
    tempId,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  };
  await enqueue(op);
  patchNetState({ pending: getNetState().pending + 1 });
  const data =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), id: tempId, _offline: true }
      : { id: tempId, _offline: true };
  return { data, status: 202, statusText: 'Queued', headers: {}, config } as AxiosResponse;
}

/** Kuyrukta bekleyen ve bu listeye kayıt ekleyecek işlemlerin geçici kayıtları. */
async function pendingCreations(
  user: string,
  shopId: string | null,
  path: string,
): Promise<Record<string, unknown>[]> {
  const ops = await listOps(user);
  return ops
    .filter((o) => o.tempId && o.method === 'post' && o.url === path && o.shopId === shopId)
    .reverse()
    .map((o) => ({ ...((o.body as Record<string, unknown>) ?? {}), id: o.tempId, _offline: true }));
}

const INVALID = Symbol('invalid-body');

/** Kuyrukta yalnız JSON gövdeler saklanır (dosya yüklemeleri sunucu ister). */
function parseBody(data: unknown): unknown {
  if (data === undefined || data === null || data === '') return undefined;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return INVALID;
    }
  }
  if (typeof FormData !== 'undefined' && data instanceof FormData) return INVALID;
  return data;
}

/** Sayfaların zaten gösterdiği biçimde ({ response.data.message }) hata. */
function offlineError(config: StConfig): Error {
  const method = (config.method ?? 'get').toLowerCase();
  const message =
    method === 'get'
      ? 'Sunucuya ulaşılamıyor ve bu ekranın kayıtlı bir kopyası yok.'
      : 'Sunucuya ulaşılamıyor. Bu işlem çevrimdışı yapılamaz; bağlantı gelince yeniden deneyin.';
  return Object.assign(new Error(message), {
    isOffline: true,
    response: { status: 0, data: { message } },
  });
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Eski tarayıcı: RFC 4122 v4 biçiminde rastgele kimlik.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken: tokenStore.refresh,
    });
    const data = res.data?.data ?? res.data;
    tokenStore.set(data.accessToken, data.refreshToken ?? tokenStore.refresh!);
    return data.accessToken;
  } catch (err) {
    // Sunucu yoksa oturum düşmez: bağlantı gelince yeniden denenir.
    if (isOfflineError(err)) return null;
    tokenStore.clear();
    window.location.href = '/login';
    return null;
  }
}
