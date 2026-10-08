import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CryptoModule } from '@/common/crypto/crypto.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '@/common/interceptors/response-transform.interceptor';
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware';
import { AppConfigModule } from '@/config/app-config.module';
import { AppConfigService } from '@/config/app-config.service';
import { PdfModule } from '@/infrastructure/pdf/pdf.module';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { RedisModule } from '@/infrastructure/redis/redis.module';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ClientsModule } from '@/modules/clients/clients.module';
import { DashboardModule } from '@/modules/dashboard/dashboard.module';
import { EventsModule } from '@/modules/events/events.module';
import { ExtraServicesModule } from '@/modules/extra-services/extra-services.module';
import { FinanceModule } from '@/modules/finance/finance.module';
import { GalleryModule } from '@/modules/gallery/gallery.module';
import { HallsModule } from '@/modules/halls/halls.module';
import { HealthModule } from '@/modules/health/health.module';
import { MenuModule } from '@/modules/menu/menu.module';
import { RolesModule } from '@/modules/roles/roles.module';
import { SettingsModule } from '@/modules/settings/settings.module';
import { ShoppingModule } from '@/modules/shopping/shopping.module';
import { UsersModule } from '@/modules/users/users.module';
import { WarehouseModule } from '@/modules/warehouse/warehouse.module';
import { WorkersModule } from '@/modules/workers/workers.module';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.app.logLevel,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const incoming = req.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
          },
          // Sirlar hech qachon logga tushmaydi.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
              'res.headers["set-cookie"]',
            ],
            censor: '[yashirilgan]',
          },
          autoLogging: !config.app.isTest,
          transport: config.app.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    PdfModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    HealthModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    HallsModule,
    ClientsModule,
    ExtraServicesModule,
    EventsModule,
    MenuModule,
    GalleryModule,
    FinanceModule,
    WarehouseModule,
    ShoppingModule,
    WorkersModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseTransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
