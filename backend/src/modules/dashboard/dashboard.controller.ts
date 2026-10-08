import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { AuthUser } from '@/common/types/auth-user';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('overview')
  @Permissions('dashboard:read')
  @ApiOperation({
    summary: 'Bosh sahifa: bugungi va ertangi to‘ylar, hafta, ombor va bozorlik ogohlantirishlari',
    description: 'Pul va oylik moliya faqat moliya ruxsati bor foydalanuvchiga qaytadi.',
  })
  overview(@CurrentUser() actor: AuthUser) {
    return this.service.overview(actor);
  }
}
