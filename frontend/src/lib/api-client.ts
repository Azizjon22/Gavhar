import axios, {
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  isAxiosError,
} from 'axios';
import { toApiError } from '@/lib/api-error';
import { endLocalSession, refreshSession, syncProfile } from '@/lib/auth-session';
import { env } from '@/lib/env';
import { useAuthStore } from '@/stores/auth.store';
import { useLocaleStore } from '@/stores/locale.store';
import type { ApiSuccess, Paginated } from '@/types/api';

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

/** Bu endpointlar o'zi sessiyani boshqaradi — 401 bo'lsa qayta urinilmaydi. */
const AUTH_FLOW_PATHS = ['/auth/login', '/auth/2fa/verify', '/auth/refresh', '/auth/logout'];
const RESTRICTION_CODES = new Set(['PASSWORD_CHANGE_REQUIRED', 'TWO_FACTOR_SETUP_REQUIRED']);

const isAuthFlow = (url: string | undefined): boolean =>
  AUTH_FLOW_PATHS.some((path) => url?.startsWith(path));

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  config.headers.set('Accept-Language', useLocaleStore.getState().language);
  return config;
});

api.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiError(error);
  const config = isAxiosError(error) ? (error.config as RetriableConfig | undefined) : undefined;

  const canRetry =
    apiError.status === 401 &&
    config !== undefined &&
    !config._retried &&
    !isAuthFlow(config.url) &&
    useAuthStore.getState().accessToken !== null;

  if (canRetry) {
    config._retried = true;
    try {
      await refreshSession();
    } catch (refreshFailure) {
      const refreshError = toApiError(refreshFailure);
      // Sessiya haqiqatan tugagan: login sahifasiga. Tarmoq yoki server
      // xatosida esa sessiya saqlanadi — keyingi so'rov qayta urinadi.
      if (refreshError.status === 401 || refreshError.status === 403) {
        endLocalSession();
        throw apiError;
      }
      throw refreshError;
    }
    return api.request(config);
  }

  if (apiError.status === 403 && RESTRICTION_CODES.has(apiError.code)) {
    // Hisob cheklangan holatga o'tgan — profil yangilanadi, router kerakli sahifaga olib boradi.
    void syncProfile().catch(() => undefined);
  }

  throw apiError;
});

/** Javobning `data` qismini ochib beradigan qisqa yordamchilar. */
export const http = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.get<ApiSuccess<T>>(url, config);
    return response.data.data;
  },

  async list<T>(url: string, params?: object): Promise<Paginated<T>> {
    const response = await api.get<ApiSuccess<T[]>>(url, { params });
    const { data, meta } = response.data;
    return {
      items: data,
      meta: meta ?? {
        page: 1,
        limit: data.length,
        total: data.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    };
  },

  async post<T = null>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await api.post<ApiSuccess<T> | ''>(url, body, config);
    return unwrap<T>(response.data);
  },

  async put<T>(url: string, body?: unknown): Promise<T> {
    const response = await api.put<ApiSuccess<T>>(url, body);
    return response.data.data;
  },

  async patch<T>(url: string, body?: unknown): Promise<T> {
    const response = await api.patch<ApiSuccess<T>>(url, body);
    return response.data.data;
  },

  async delete<T = null>(url: string): Promise<T> {
    const response = await api.delete<ApiSuccess<T> | ''>(url);
    return unwrap<T>(response.data);
  },
};

/** 204 No Content javoblarida tana bo'sh keladi. */
function unwrap<T>(body: ApiSuccess<T> | ''): T {
  return body === '' ? (null as T) : body.data;
}
