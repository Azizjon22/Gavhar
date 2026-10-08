import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { AuthUser } from '@/common/types/auth-user';
import { CreateUserDto, ListUsersDto, ResetUserPasswordDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Foydalanuvchilar')
@ApiBearerAuth()
@SuperAdminOnly()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Foydalanuvchilar ro'yxati" })
  list(@Query() query: ListUsersDto) {
    return this.usersService.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Yangi foydalanuvchi (birinchi kirishda parolni almashtiradi)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.usersService.create(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta foydalanuvchi' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: "Ma'lumotlari yoki rolini o'zgartirish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloklash (barcha sessiyalari yopiladi)' })
  block(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.setStatus(id, UserStatus.BLOCKED, actor);
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Blokdan chiqarish' })
  unblock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.usersService.setStatus(id, UserStatus.ACTIVE, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Parolni tiklash: vaqtinchalik parol, sessiyalar yopiladi' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.usersService.resetPassword(id, dto, actor);
  }

  @Post(':id/reset-2fa')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "2FA ni tiklash (qurilma yo'qolganda)" })
  async resetTwoFactor(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.usersService.resetTwoFactor(id, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Foydalanuvchini o'chirish (soft delete)" })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.usersService.remove(id, actor);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Foydalanuvchining faol sessiyalari' })
  listSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.listSessions(id);
  }

  @Delete(':id/sessions')
  @ApiOperation({ summary: 'Foydalanuvchining barcha sessiyalarini yopish' })
  revokeAllSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.revokeAllSessions(id);
  }

  @Delete(':id/sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Foydalanuvchining bitta sessiyasini yopish' })
  async revokeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.usersService.revokeSession(id, sessionId);
  }
}
