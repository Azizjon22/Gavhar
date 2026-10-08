import { resolve } from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      // Yagona .env monorepo ildizida turadi (docker-compose ham shuni o'qiydi).
      envFilePath: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
