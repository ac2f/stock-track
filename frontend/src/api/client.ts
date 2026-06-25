import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import type { ApiEnvelope } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

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

// Her isteğe access token ekle (stateless kimlik).
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401 → access token süresi dolmuş olabilir; bir kez yenilemeyi dene.
    if (error.response?.status === 401 && !original._retry && tokenStore.refresh) {
      original._retry = true;
      refreshing ??= refreshAccessToken();
      const newAccess = await refreshing;
      refreshing = null;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken: tokenStore.refresh,
    });
    const data = res.data?.data ?? res.data;
    tokenStore.set(data.accessToken, data.refreshToken ?? tokenStore.refresh!);
    return data.accessToken;
  } catch {
    tokenStore.clear();
    window.location.href = '/login';
    return null;
  }
}
