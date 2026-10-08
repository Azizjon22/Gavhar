import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException } from '@/common/errors/app.exception';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { redisKeys } from '../auth.constants';

export const MAX_LOGIN_FAILURES = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;
/** Progressiv kutish: har navbatdagi bloklash uzoqroq davom etadi. */
export const LOCK_DURATIONS_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60] as const;
const LOCK_LEVEL_TTL_SECONDS = 24 * 60 * 60;

const lockedError = (retryAfterSeconds: number) =>
  AppException.tooManyRequests(
    'ACCOUNT_LOCKED',
    "Juda ko'p xato urinish. Hisob vaqtincha bloklandi",
    retryAfterSeconds,
  );

/**
 * Hisob bo'yicha brute-force himoyasi. Email mavjud yoki yo'qligidan qat'i
 * nazar bir xil ishlaydi — javobdan hisob borligini bilib bo'lmaydi.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async assertNotLocked(email: string): Promise<void> {
    const ttl = await this.redis.ttl(redisKeys.loginLock(email));
    if (ttl > 0) throw lockedError(ttl);
  }

  /** Xato urinishni qayd etadi; chegaraga yetganda hisobni bloklab, xato tashlaydi. */
  async registerFailure(email: string): Promise<void> {
    const failuresKey = redisKeys.loginFailures(email);
    const failures = await this.redis.incr(failuresKey);
    if (failures === 1) {
      await this.redis.expire(failuresKey, FAILURE_WINDOW_SECONDS);
    }
    if (failures < MAX_LOGIN_FAILURES) return;

    const levelKey = redisKeys.loginLockLevel(email);
    const level = await this.redis.incr(levelKey);
    await this.redis.expire(levelKey, LOCK_LEVEL_TTL_SECONDS);

    const lastStep = LOCK_DURATIONS_SECONDS.length - 1;
    const duration = LOCK_DURATIONS_SECONDS[Math.min(level - 1, lastStep)] ?? 60 * 60;

    await this.redis
      .multi()
      .set(redisKeys.loginLock(email), '1', 'EX', duration)
      .del(failuresKey)
      .exec();

    throw lockedError(duration);
  }

  async reset(email: string): Promise<void> {
    await this.redis.del(redisKeys.loginFailures(email), redisKeys.loginLockLevel(email));
  }

  /**
   * Bloklashni darhol olib tashlaydi. SUPER_ADMIN parolni tiklaganda chaqiriladi:
   * parolini unutib bloklangan xodim yangi parol bilan kutmasdan kira olsin.
   */
  async unlock(email: string): Promise<void> {
    await this.redis.del(
      redisKeys.loginLock(email),
      redisKeys.loginFailures(email),
      redisKeys.loginLockLevel(email),
    );
  }
}
