import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { authenticator } from 'otplib';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { configureApp } from '@/app.setup';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';
import { bootstrapAccessControl } from '../../prisma/seed/bootstrap';

export const SUPER_ADMIN = {
  email: 'root@gavhar.test',
  fullName: 'Test Root',
  password: 'Seed!Parol2026aA',
} as const;

export const NEW_PASSWORD = 'Yangi!Parol2026bB';
export const TEMP_PASSWORD = 'Vaqtincha!2026cC';

export type Agent = ReturnType<typeof request.agent>;

export interface Authenticated {
  agent: Agent;
  accessToken: string;
  csrfToken: string;
  auth: { Authorization: string };
}

export interface ActiveSuperAdmin extends Authenticated {
  totpSecret: string;
  backupCodes: string[];
}

/** `offsetSteps`: +1 keyingi 30 soniyalik qadam kodi — replay himoyasini chetlab o'tmasdan ikkinchi kod. */
export const totpCode = (secret: string, offsetSteps = 0): string =>
  authenticator.clone({ epoch: Date.now() + offsetSteps * 30_000 }).generate(secret);

export class TestApp {
  private constructor(
    readonly app: NestExpressApplication,
    readonly prisma: PrismaService,
    readonly redis: Redis,
  ) {}

  static async create(): Promise<TestApp> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    return new TestApp(app, app.get(PrismaService), app.get<Redis>(REDIS_CLIENT));
  }

  get server() {
    return this.app.getHttpServer() as Parameters<typeof request>[0];
  }

  http() {
    return request(this.server);
  }

  agent(): Agent {
    return request.agent(this.server);
  }

  /** Toza holat: bo'sh baza, bo'sh Redis, faqat seed qilingan SUPER_ADMIN. */
  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE dishes, event_workers, workers, shopping_items, shopping_lists, expenses, expense_categories, stock_movements, warehouse_items, audit_logs, backup_codes, refresh_tokens, sessions, users, role_permissions, permissions, roles, gallery_items, gallery_albums, menu_package_prices, menu_package_sections, menu_packages, menu_categories, payments, event_services, events, extra_services, settings, hall_images, halls, clients RESTART IDENTITY CASCADE',
    );
    await this.redis.flushdb();
    await bootstrapAccessControl(this.prisma, SUPER_ADMIN, process.env.PASSWORD_PEPPER as string);
  }

  async clearRateLimits(): Promise<void> {
    const keys = await this.redis.keys('rate-limit:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  async login(email: string, password: string): Promise<Authenticated> {
    const agent = this.agent();
    const res = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
    return toAuthenticated(agent, res.body.data);
  }

  /** Seed qilingan SUPER_ADMIN'ni to'liq ishchi holatga keltiradi: yangi parol + 2FA. */
  async activateSuperAdmin(): Promise<ActiveSuperAdmin> {
    const session = await this.login(SUPER_ADMIN.email, SUPER_ADMIN.password);
    const { agent, auth } = session;

    await agent
      .post('/api/v1/auth/change-password')
      .set(auth)
      .send({ currentPassword: SUPER_ADMIN.password, newPassword: NEW_PASSWORD })
      .expect(204);

    const setup = await agent.post('/api/v1/auth/2fa/setup').set(auth).expect(200);
    const totpSecret: string = setup.body.data.secret;

    const enabled = await agent
      .post('/api/v1/auth/2fa/enable')
      .set(auth)
      .send({ code: totpCode(totpSecret) })
      .expect(200);

    return { ...session, totpSecret, backupCodes: enabled.body.data.backupCodes };
  }

  /** Yangi foydalanuvchi yaratadi va vaqtinchalik parolini almashtirib, tizimga kiritadi. */
  async createActiveUser(
    admin: Authenticated,
    input: { email: string; fullName: string; roleId: string },
  ): Promise<Authenticated & { id: string }> {
    const created = await this.http()
      .post('/api/v1/users')
      .set(admin.auth)
      .send({ ...input, password: TEMP_PASSWORD })
      .expect(201);

    const session = await this.login(input.email, TEMP_PASSWORD);
    await session.agent
      .post('/api/v1/auth/change-password')
      .set(session.auth)
      .send({ currentPassword: TEMP_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    return { ...session, id: created.body.data.id };
  }

  async roleId(key: string): Promise<string> {
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key } });
    return role.id;
  }
}

const toAuthenticated = (
  agent: Agent,
  data: { accessToken: string; csrfToken: string },
): Authenticated => ({
  agent,
  accessToken: data.accessToken,
  csrfToken: data.csrfToken,
  auth: { Authorization: `Bearer ${data.accessToken}` },
});
