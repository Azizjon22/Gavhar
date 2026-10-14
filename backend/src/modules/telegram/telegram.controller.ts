import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AllowRestricted } from '@/common/decorators/allow-restricted.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AuthUser } from '@/common/types/auth-user';
import { AuthService } from '@/modules/auth/auth.service';
import { AuthCookieService } from '@/modules/auth/services/auth-cookie.service';
import { TelegramService } from './telegram.service';

export class TelegramAuthDto {
  /** Telegram.WebApp.initData — Telegram imzolagan satr. */
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  initData: string;
}

@ApiTags('Telegram')
@ApiBearerAuth()
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  @AllowRestricted()
  @ApiOperation({ summary: 'Bot sozlanganmi va hisobim ulanganmi' })
  status(@CurrentUser() actor: AuthUser) {
    return this.telegram.status(actor);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Botni ulash havolasi',
    description: 'Bir martalik `t.me/<bot>?start=<token>` havolasi, 15 daqiqa amal qiladi.',
  })
  createLink(@CurrentUser() actor: AuthUser) {
    return this.telegram.createLink(actor);
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Botni hisobimdan uzish' })
  async unlink(@CurrentUser() actor: AuthUser): Promise<void> {
    await this.telegram.unlinkUser(actor);
  }
}

/**
 * Mini App (Telegram ichida ochiladigan sayt) uchun parolsiz kirish: Telegram imzolagan
 * initData va avval Profil sahifasidan ulangan chat — kimlik isboti.
 */
@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller('auth')
export class TelegramAuthController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'login-telegram', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Telegram Mini App orqali kirish' })
  async login(
    @Body() dto: TelegramAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.telegram.userForInitData(dto.initData);
    const { session, ...body } = await this.auth.completeLogin(
      user.id,
      user.email,
      'auth.telegram_login',
    );
    this.cookies.setRefreshToken(res, session.refreshToken, session.expiresAt);
    return { requiresTwoFactor: false, ...body, csrfToken: this.cookies.issueCsrfToken(req, res) };
  }
}
