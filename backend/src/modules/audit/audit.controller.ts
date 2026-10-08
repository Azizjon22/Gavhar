import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('Audit log')
@ApiBearerAuth()
@SuperAdminOnly()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: "Audit log ro'yxati (faqat SUPER_ADMIN)" })
  list(@Query() query: ListAuditLogsDto) {
    return this.auditService.list(query);
  }
}
