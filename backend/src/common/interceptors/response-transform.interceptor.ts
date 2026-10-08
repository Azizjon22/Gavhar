import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiSuccessResponse } from '../dto/api-response.dto';
import { Paginated } from '../dto/pagination.dto';

/** Controller natijasini yagona `{ success, data, meta? }` formatiga o'raydi. */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body: unknown): unknown => {
        // Fayl oqimlari (PDF, Excel, ZIP) o'ralmaydi.
        if (body instanceof StreamableFile) return body;

        if (body instanceof Paginated) {
          const response: ApiSuccessResponse<unknown[]> = {
            success: true,
            data: body.items as unknown[],
            meta: body.meta,
          };
          return response;
        }

        const response: ApiSuccessResponse<unknown> = { success: true, data: body ?? null };
        return response;
      }),
    );
  }
}
