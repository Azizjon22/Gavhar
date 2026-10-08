import { PaginationMeta } from './pagination.dto';

/** Barcha muvaffaqiyatli javoblarning yagona ko'rinishi. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

/** Barcha xato javoblarning yagona ko'rinishi. */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
  path: string;
  timestamp: string;
}
