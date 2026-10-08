import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { HealthStatusDto, ReadinessDto } from './dto/health-status.dto';
import { HealthService } from './health.service';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Servis holati (liveness)' })
  @ApiOkResponse({ type: HealthStatusDto })
  check(): HealthStatusDto {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'PostgreSQL, Redis va fayl saqlash holati (readiness)' })
  @ApiOkResponse({ type: ReadinessDto })
  readiness(): Promise<ReadinessDto> {
    return this.healthService.readiness();
  }
}
