import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowRestricted } from '@/common/decorators/allow-restricted.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '@/common/guards/rate-limit.guard';
import { AuthUser } from '@/common/types/auth-user';
import { DisableTwoFactorDto, TwoFactorCodeDto } from '../dto/two-factor.dto';
import { TwoFactorService } from '../services/two-factor.service';

@ApiTags('Auth · 2FA')
@ApiBearerAuth()
@AllowRestricted()
@UseGuards(RateLimitGuard)
@RateLimit({ name: '2fa-manage', limit: 20, windowSeconds: 300 })
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get('status')
  @ApiOperation({ summary: '2FA holati va qolgan zaxira kodlar soni' })
  async status(@CurrentUser() user: AuthUser) {
    return {
      enabled: user.twoFactorEnabled,
      backupCodesRemaining: user.twoFactorEnabled
        ? await this.twoFactor.backupCodesRemaining(user.id)
        : 0,
    };
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '2FA ulashni boshlash: sir va QR kod' })
  setup(@CurrentUser() user: AuthUser) {
    return this.twoFactor.beginSetup(user);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Kodni tasdiqlab 2FA ni yoqish; zaxira kodlar qaytadi' })
  enable(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.enable(user, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "2FA ni o'chirish (SUPER_ADMIN uchun taqiqlangan)" })
  async disable(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto): Promise<void> {
    await this.twoFactor.disable(user, dto.password, dto.code);
  }

  @Post('backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Zaxira kodlarni yangilash (eskilari bekor bo‘ladi)' })
  regenerateBackupCodes(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) {
    return this.twoFactor.regenerateBackupCodes(user, dto.code);
  }
}
