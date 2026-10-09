import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppConfigService } from '@/config/app-config.service';

export const API_PREFIX = 'api';
export const API_VERSION = '1';
export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/** Origin yo'q (curl, server) yoki ro'yxatdagi manzil. Dev'da shu portdagi LAN IP ham. */
export function isAllowedOrigin(
  origin: string | undefined,
  frontendUrl: string,
  isProduction: boolean,
): boolean {
  if (!origin || origin === frontendUrl) return true;
  if (isProduction) return false;

  let incoming: URL;
  let allowed: URL;
  try {
    incoming = new URL(origin);
    allowed = new URL(frontendUrl);
  } catch {
    return false;
  }
  if (incoming.protocol !== 'http:' || incoming.port !== allowed.port) return false;
  const host = incoming.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  const parts = host.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * HTTP qatlamining barcha global sozlamalari. `main.ts` va e2e testlar
 * bir xil sozlangan ilovada ishlashi uchun alohida funksiyada.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  // Reverse proxy (nginx) ortida haqiqiy mijoz IP'sini olish uchun.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    // Dev'da telefon bir xil Wi-Fi dagi xususiy IP orqali kiradi. Production'da
    // faqat APP_URL.
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin, config.app.frontendUrl, config.app.isProduction));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Request-Id',
      'Accept-Language',
    ],
    exposedHeaders: ['Content-Disposition', 'X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
    }),
  );

  if (config.app.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Gavhar API')
        .setDescription("Gavhar to'yxonasi va Gavhar Studio ichki boshqaruv tizimi")
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(SWAGGER_PATH, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();
}
