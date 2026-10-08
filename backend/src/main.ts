import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@/app.module';
import { API_PREFIX, API_VERSION, SWAGGER_PATH, configureApp } from '@/app.setup';
import { AppConfigService } from '@/config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  configureApp(app);

  const config = app.get(AppConfigService);
  await app.listen(config.app.port);

  const baseUrl = `http://localhost:${config.app.port}`;
  logger.log(`API: ${baseUrl}/${API_PREFIX}/v${API_VERSION}`, 'Bootstrap');
  if (config.app.swaggerEnabled) {
    logger.log(`Swagger: ${baseUrl}/${SWAGGER_PATH}`, 'Bootstrap');
  }
}

bootstrap().catch((error: unknown) => {
  // Logger hali tayyor bo'lmasligi mumkin (masalan, env validatsiya xatosi).
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
