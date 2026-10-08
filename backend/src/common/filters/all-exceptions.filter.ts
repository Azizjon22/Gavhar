import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../dto/api-response.dto';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Har qanday xatoni yagona formatga keltiradi. Kutilmagan (5xx) xatolarning
 * ichki tafsilotlari mijozga chiqmaydi — faqat logga yoziladi.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string | number }>();
    const response = http.getResponse<Response>();

    const error = this.normalize(exception);

    if (error.status >= 500) {
      this.logger.error(
        { err: exception, path: request.originalUrl, method: request.method },
        'Kutilmagan xato',
      );
    }

    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined && { details: error.details }),
      },
      requestId: request.id !== undefined ? String(request.id) : undefined,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };

    response.status(error.status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Ichki server xatosi',
      };
    }

    const status = exception.getStatus();
    const payload = exception.getResponse();
    const fallbackCode = HttpStatus[status] ?? 'ERROR';

    if (typeof payload === 'string') {
      return { status, code: fallbackCode, message: payload };
    }

    if (isRecord(payload)) {
      const code = typeof payload.code === 'string' ? payload.code : fallbackCode;

      // ValidationPipe xabarlarni massiv ko'rinishida beradi.
      if (Array.isArray(payload.message)) {
        return {
          status,
          code: status === 400 ? 'VALIDATION_ERROR' : code,
          message: "Ma'lumotlar noto'g'ri kiritilgan",
          details: payload.message,
        };
      }

      return {
        status,
        code,
        message: typeof payload.message === 'string' ? payload.message : exception.message,
        details: payload.details,
      };
    }

    return { status, code: fallbackCode, message: exception.message };
  }
}
