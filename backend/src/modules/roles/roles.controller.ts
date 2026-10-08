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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RolesService } from './roles.service';

@ApiTags('Rollar')
@ApiBearerAuth()
@SuperAdminOnly()
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('permissions')
  @ApiOperation({ summary: "Mavjud ruxsatlar katalogi (resurs bo'yicha guruhlangan)" })
  permissionCatalog() {
    return this.rolesService.permissionCatalog();
  }

  @Get('roles')
  @ApiOperation({ summary: "Rollar ro'yxati" })
  list() {
    return this.rolesService.list();
  }

  @Post('roles')
  @ApiOperation({ summary: 'Yangi custom rol' })
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get('roles/:id')
  @ApiOperation({ summary: 'Bitta rol' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch('roles/:id')
  @ApiOperation({ summary: "Rol nomi, tavsifi yoki ruxsatlarini o'zgartirish" })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(id, dto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Custom rolni o'chirish" })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rolesService.remove(id);
  }
}
