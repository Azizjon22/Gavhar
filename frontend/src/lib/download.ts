import { isAxiosError } from 'axios';
import { api } from '@/lib/api-client';
import { ApiError, toApiError } from '@/lib/api-error';
import type { ApiErrorBody } from '@/types/api';

const FILENAME = /filename="?([^";]+)"?/;

/** Fayl so'rovida xato ham Blob bo'lib keladi — undan xato kodini o'qiydi. */
async function blobError(error: unknown): Promise<ApiError> {
  if (isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      const body = JSON.parse(await error.response.data.text()) as Partial<ApiErrorBody>;
      if (body.error?.code) {
        return new ApiError(error.response.status, body.error.code, body.error.message);
      }
    } catch {
      // JSON emas — umumiy xatoga tushadi.
    }
  }
  return toApiError(error);
}

/** Himoyalangan faylni (PDF, Excel) token bilan olib, brauzerda saqlaydi. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  try {
    const response = await api.get<Blob>(url, { responseType: 'blob', timeout: 60_000 });
    const disposition = String(response.headers['content-disposition'] ?? '');
    const filename = FILENAME.exec(disposition)?.[1] ?? fallbackName;

    const objectUrl = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    throw await blobError(error);
  }
}
