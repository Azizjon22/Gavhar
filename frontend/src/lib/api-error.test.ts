import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from './api-error';

const responseError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data,
  } as AxiosResponse);

describe('toApiError', () => {
  it('backend xato formatini ochadi', () => {
    const error = toApiError(
      responseError(429, {
        success: false,
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Bloklandi',
          details: { retryAfterSeconds: 60 },
        },
        requestId: 'req-1',
      }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: 'ACCOUNT_LOCKED', requestId: 'req-1' });
    expect(error.retryAfterSeconds).toBe(60);
  });

  it('tarmoq xatosi va timeoutni ajratadi', () => {
    expect(toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))).toMatchObject({
      status: 0,
      code: 'NETWORK',
    });
    expect(toApiError(new AxiosError('timeout', 'ECONNABORTED'))).toMatchObject({
      status: 0,
      code: 'TIMEOUT',
    });
  });

  it("formatsiz javob (masalan proxy'dan HTML) uchun UNKNOWN", () => {
    expect(toApiError(responseError(502, '<html>Bad Gateway</html>'))).toMatchObject({
      status: 502,
      code: 'UNKNOWN',
    });
  });

  it('mavjud ApiError va oddiy xatolarni ham qabul qiladi', () => {
    const original = new ApiError(403, 'FORBIDDEN', 'Ruxsat yo‘q');

    expect(toApiError(original)).toBe(original);
    expect(toApiError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN', message: 'boom' });
    expect(original.retryAfterSeconds).toBeUndefined();
  });
});
