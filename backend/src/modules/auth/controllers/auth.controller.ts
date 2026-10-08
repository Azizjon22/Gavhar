import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AllowRestricted } from '@/common/decorators/allow-restricted.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { CsrfGuard } from '@/common/guards/csrf.guard';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AuthUser } from '@/common/types/auth-user';
import { AuthService, AuthTokens } from '../auth.service';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { LoginDto } from '../dto/login.dto';
import { TwoFactorLoginDto } from '../dto/two-factor.dto';
import { AuthCookieService } from '../services/auth-cookie.service';

@ApiTags('Auth')
@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'login', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Email va parol bilan kirish' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if (result.requiresTwoFactor) return result;
    return { requiresTwoFactor: false, ...this.respondWithTokens(req, res, result) };
  }

  @Public()
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'login-2fa', limit: 10, windowSeconds: 60 })
  @ApiOperation({ summary: 'Kirishning ikkinchi bosqichi: TOTP yoki zaxira kod' })
  async verifyTwoFactor(
    @Body() dto: TwoFactorLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.verifyTwoFactorLogin(dto);
    return { requiresTwoFactor: false, ...this.respondWithTokens(req, res, tokens) };
  }

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'CSRF tokenini olish (refresh va logout uchun)' })
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { csrfToken: this.cookies.issueCsrfToken(req, res) };
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'refresh', limit: 30, windowSeconds: 60 })
  @ApiOperation({ summary: 'Access tokenni yangilash (refresh token rotation)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.authService.refresh(this.cookies.readRefreshToken(req));
      return this.respondWithTokens(req, res, tokens);
    } catch (error) {
      // Faqat sessiya haqiqatan yaroqsiz bo'lsa tozalanadi — vaqtinchalik
      // server xatosi foydalanuvchini tizimdan chiqarib yubormasligi kerak.
      if (error instanceof HttpException && error.getStatus() === 401) {
        this.cookies.clear(res);
      }
      throw error;
    }
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Chiqish: joriy sessiya bekor qilinadi' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.authService.logout(this.cookies.readRefreshToken(req));
    this.cookies.clear(res);
  }

  @Get('me')
  @AllowRestricted()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Joriy foydalanuvchi, roli va ruxsatlari' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.profileOf(user);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowRestricted()
  @ApiBearerAuth()
  @RateLimit({ name: 'change-password', limit: 10, windowSeconds: 300 })
  @ApiOperation({ summary: "Parolni o'zgartirish (boshqa qurilmalardagi sessiyalar yopiladi)" })
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user, dto);
  }

  private respondWithTokens(req: Request, res: Response, tokens: AuthTokens) {
    const { session, ...body } = tokens;
    this.cookies.setRefreshToken(res, session.refreshToken, session.expiresAt);
    return { ...body, csrfToken: this.cookies.issueCsrfToken(req, res) };
  }
}
