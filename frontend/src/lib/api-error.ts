import { isAxiosError } from 'axios';
import type { ApiErrorBody } from '@/types/api';

/** Backend'ning yagona xato formatidan yoki tarmoq xatosidan yasalgan xato. */
export class ApiError extends Error {
  constructor(
    /** HTTP status; tarmoq xatosida 0. */
    readonly status: number,
    /** Mashina o'qiydigan kod: `INVALID_CREDENTIALS`, `NETWORK`, ... */
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** `ACCOUNT_LOCKED` va `RATE_LIMITED` uchun: necha soniyadan keyin urinish mumkin. */
  get retryAfterSeconds(): number | undefined {
    const details = this.details as { retryAfterSeconds?: unknown } | undefined;
    return typeof details?.retryAfterSeconds === 'number' ? details.retryAfterSeconds : undefined;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isAxiosError(error)) {
    const { response } = error;
    if (!response) {
      return new ApiError(0, error.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK', error.message);
    }
    const body = response.data as Partial<ApiErrorBody> | undefined;
    if (body?.error?.code) {
      return new ApiError(
        response.status,
        body.error.code,
        body.error.message,
        body.error.details,
        body.requestId,
      );
    }
    return new ApiError(response.status, 'UNKNOWN', error.message);
  }

  return new ApiError(0, 'UNKNOWN', error instanceof Error ? error.message : String(error));
}
