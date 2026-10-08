import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionRevokeReason } from '@prisma/client';
import { AllowRestricted } from '@/common/decorators/allow-restricted.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { AppException } from '@/common/errors/app.exception';
import { AuthUser } from '@/common/types/auth-user';
import { AuditService } from '@/modules/audit/audit.service';
import { SessionsService } from '../services/sessions.service';

@ApiTags('Auth · Sessiyalar')
@ApiBearerAuth()
@AllowRestricted()
@Controller('auth/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "O'zining faol sessiyalari (qurilma, IP, vaqt)" })
  async list(@CurrentUser() user: AuthUser) {
    const sessions = await this.sessions.listActive(user.id);
    return sessions.map((session) => ({ ...session, isCurrent: session.id === user.sessionId }));
  }

  @Delete()
  @ApiOperation({ summary: 'Joriy sessiyadan boshqa barcha sessiyalarni yopish' })
  async revokeOthers(@CurrentUser() user: AuthUser) {
    const revoked = await this.sessions.revokeAllForUser(
      user.id,
      SessionRevokeReason.REVOKED_BY_USER,
      user.sessionId,
    );
    if (revoked > 0) {
      await this.audit.log({
        action: 'session.revoke_others',
        resource: 'user',
        resourceId: user.id,
        after: { revokedSessions: revoked },
      });
    }
    return { revoked };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bitta sessiyani yopish' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const revoked = await this.sessions.revoke(id, SessionRevokeReason.REVOKED_BY_USER, user.id);
    if (!revoked) {
      throw AppException.notFound('SESSION_NOT_FOUND', 'Sessiya topilmadi');
    }
    await this.audit.log({ action: 'session.revoke', resource: 'session', resourceId: id });
  }
}
