import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Mashina o'qiy oladigan `code` bilan biznes xatosi. Frontend xabarni
 * `code` bo'yicha tarjima qiladi; `message` — zaxira matn.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static unauthorized(code: string, message: string) {
    return new AppException(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.FORBIDDEN, code, message, details);
  }

  static notFound(code: string, message: string) {
    return new AppException(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: string, message: string, details?: unknown) {
    return new AppException(HttpStatus.CONFLICT, code, message, details);
  }

  static tooManyRequests(code: string, message: string, retryAfterSeconds: number) {
    return new AppException(HttpStatus.TOO_MANY_REQUESTS, code, message, { retryAfterSeconds });
  }
}
