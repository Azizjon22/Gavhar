import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Paginated } from '@/common/dto/pagination.dto';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser, AuthenticatedRequest } from '@/common/types/auth-user';

/** Pulni faqat SUPER_ADMIN va moliya ruxsati (`finance:read`) bor rollar ko'radi. */
export const canSeeMoney = (user: AuthUser): boolean =>
  user.roleKey === SYSTEM_ROLES.SUPER_ADMIN || user.permissions.includes('finance:read');

const MONEY_FIELDS = [
  'totalAmount',
  'paidAmount',
  'debt',
  'pricePerGuest',
  'guestsTotal',
  'extrasTotal',
  'discount',
  'requiredDeposit',
  'minDepositPercent',
  'payments',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Bron ko'rinishidan narx, to'lov va qarzga oid hamma narsani olib tashlaydi. */
export function withoutMoney<T>(event: T): T {
  if (!isRecord(event) || !('guestCount' in event)) return event;
  const rest: Record<string, unknown> = { ...event };
  for (const field of MONEY_FIELDS) delete rest[field];
  if (Array.isArray(rest.services)) {
    rest.services = rest.services.map((service: unknown) => {
      if (!isRecord(service)) return service;
      const { unitPrice: _unitPrice, total: _total, ...line } = service;
      return line;
    });
  }
  return rest as T;
}

/**
 * Admin va zavzal to'ylarni yuritadi, lekin pulni ko'rmaydi: bron javoblaridan summa,
 * to'lovlar va qarz olib tashlanadi. Tekshiruv bitta joyda — hech bir endpoint unutilmaydi.
 */
@Injectable()
export class EventMoneyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (canSeeMoney(user)) return next.handle();

    return next.handle().pipe(
      map((data: unknown) => {
        if (data instanceof Paginated) {
          const items = data.items as unknown[];
          items.forEach((item, index) => {
            items[index] = withoutMoney(item);
          });
          return data;
        }
        return Array.isArray(data) ? data.map(withoutMoney) : withoutMoney(data);
      }),
    );
  }
}
