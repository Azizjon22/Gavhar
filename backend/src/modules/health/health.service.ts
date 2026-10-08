import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException } from '@/common/errors/app.exception';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { StorageService } from '@/infrastructure/storage/storage.service';
import { HealthStatusDto, ReadinessDto } from './dto/health-status.dto';

const check = async (probe: () => Promise<unknown>): Promise<'up' | 'down'> => {
  try {
    await probe();
    return 'up';
  } catch {
    return 'down';
  }
};

@Injectable()
export class HealthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: StorageService,
  ) {}

  check(): HealthStatusDto {
    return {
      status: 'ok',
      environment: this.config.app.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /** Bog'liq xizmatlar (baza, Redis, fayl saqlash) ishlayaptimi — load balancer va monitoring uchun. */
  async readiness(): Promise<ReadinessDto> {
    const [database, redis, storage] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
      check(() => this.storage.ping()),
    ]);
    const result: ReadinessDto = { status: 'ok', services: { database, redis, storage } };

    if (Object.values(result.services).includes('down')) {
      throw new AppException(
        503,
        'SERVICE_UNAVAILABLE',
        'Bog‘liq xizmat ishlamayapti',
        result.services,
      );
    }
    return result;
  }
}
