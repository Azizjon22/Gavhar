import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { CsrfGuard } from '@/common/guards/csrf.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AuthService } from './auth.service';
import { AuthController } from './controllers/auth.controller';
import { SessionsController } from './controllers/sessions.controller';
import { TwoFactorController } from './controllers/two-factor.controller';
import { AuthContextService } from './services/auth-context.service';
import { AuthCookieService } from './services/auth-cookie.service';
import { LoginAttemptsService } from './services/login-attempts.service';
import { SessionsService } from './services/sessions.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, TwoFactorController, SessionsController],
  providers: [
    AuthService,
    AuthContextService,
    AuthCookieService,
    LoginAttemptsService,
    SessionsService,
    TokenService,
    TwoFactorService,
    RateLimitGuard,
    CsrfGuard,
    // Tartib muhim: avval kimligi aniqlanadi, keyin ruxsati tekshiriladi.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [
    AuthContextService,
    LoginAttemptsService,
    SessionsService,
    TwoFactorService,
    RateLimitGuard,
  ],
})
export class AuthModule {}
