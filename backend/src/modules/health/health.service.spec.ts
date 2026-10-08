import { Redis } from 'ioredis';
import { AppConfigService } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { StorageService } from '@/infrastructure/storage/storage.service';
import { HealthService } from './health.service';

type Probe = () => Promise<unknown>;

const build = (overrides: { db?: Probe; redis?: Probe; storage?: Probe } = {}) => {
  const config = { app: { nodeEnv: 'test' } } as AppConfigService;
  const prisma = { $queryRaw: overrides.db ?? (() => Promise.resolve([1])) };
  const redis = { ping: overrides.redis ?? (() => Promise.resolve('PONG')) };
  const storage = { ping: overrides.storage ?? (() => Promise.resolve()) };
  return new HealthService(
    config,
    prisma as unknown as PrismaService,
    redis as unknown as Redis,
    storage as unknown as StorageService,
  );
};

describe('HealthService', () => {
  it('servis holatini qaytaradi', () => {
    const result = build().check();

    expect(result.status).toBe('ok');
    expect(result.environment).toBe('test');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('barcha xizmatlar ishlasa readiness ok', async () => {
    await expect(build().readiness()).resolves.toEqual({
      status: 'ok',
      services: { database: 'up', redis: 'up', storage: 'up' },
    });
  });

  it('Redis ishlamasa 503 qaytaradi', async () => {
    const service = build({ redis: () => Promise.reject(new Error('ECONNREFUSED')) });

    await expect(service.readiness()).rejects.toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('fayl saqlash joyi ishlamasa ham 503 qaytaradi', async () => {
    const service = build({ storage: () => Promise.reject(new Error('NoSuchBucket')) });

    await expect(service.readiness()).rejects.toMatchObject({ status: 503 });
  });
});
