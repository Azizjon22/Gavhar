import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.schema';

/**
 * Validatsiyadan o'tgan muhitga tiplangan, guruhlangan kirish.
 * Modullar `process.env` ni to'g'ridan-to'g'ri o'qimaydi.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get app() {
    const nodeEnv = this.get('NODE_ENV');
    return {
      nodeEnv,
      isProduction: nodeEnv === 'production',
      isTest: nodeEnv === 'test',
      port: this.get('API_PORT'),
      frontendUrl: this.get('APP_URL').replace(/\/+$/, ''),
      timezone: this.get('TZ'),
      logLevel: this.get('LOG_LEVEL'),
      swaggerEnabled: this.get('SWAGGER_ENABLED'),
    } as const;
  }

  get database() {
    return { url: this.get('DATABASE_URL') } as const;
  }

  get redis() {
    return { url: this.get('REDIS_URL') } as const;
  }

  get auth() {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL_MINUTES') * 60,
      refreshTtlSeconds: this.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60,
      passwordPepper: this.get('PASSWORD_PEPPER'),
      encryptionKey: Buffer.from(this.get('ENCRYPTION_KEY'), 'hex'),
      cookieSecure: this.get('COOKIE_SECURE'),
      superAdminTwoFactorRequired: this.get('SUPER_ADMIN_2FA_REQUIRED'),
    } as const;
  }

  get storage() {
    return {
      endpoint: this.get('S3_ENDPOINT'),
      publicEndpoint: this.get('S3_PUBLIC_ENDPOINT'),
      region: this.get('S3_REGION'),
      accessKey: this.get('S3_ACCESS_KEY'),
      secretKey: this.get('S3_SECRET_KEY'),
      forcePathStyle: this.get('S3_FORCE_PATH_STYLE'),
      buckets: {
        originals: this.get('S3_BUCKET_ORIGINALS'),
        derivatives: this.get('S3_BUCKET_DERIVATIVES'),
      },
    } as const;
  }
}
