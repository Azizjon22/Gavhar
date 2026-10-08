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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { AuthUser } from '@/common/types/auth-user';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import {
  AssignWorkerDto,
  CreateWorkerDto,
  ListWorkersQueryDto,
  UpdateWorkerDto,
} from './dto/worker.dto';
import { WorkersService } from './workers.service';

@ApiTags('Ishchilar')
@ApiBearerAuth()
@Controller()
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Get('workers')
  @Permissions('staff:read')
  @ApiOperation({ summary: 'Ishchilar ro‘yxati (ofitsiant, oshpaz va boshqalar)' })
  list(@Query() query: ListWorkersQueryDto) {
    return this.service.list(query);
  }

  @Post('workers')
  @Permissions('staff:create')
  @ApiOperation({ summary: 'Yangi ishchi' })
  create(@Body() dto: CreateWorkerDto) {
    return this.service.create(dto);
  }

  @Patch('workers/:id')
  @Permissions('staff:update')
  @ApiOperation({ summary: 'Ishchi ma’lumotini o‘zgartirish yoki faolligini almashtirish' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkerDto) {
    return this.service.update(id, dto);
  }

  @Delete('workers/:id')
  @Permissions('staff:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ishchini ro‘yxatdan olib tashlash' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }

  @Post('workers/:id/photo')
  @Permissions('staff:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Ishchi rasmi (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  setPhoto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.service.setPhoto(id, file);
  }

  @Delete('workers/:id/photo')
  @Permissions('staff:update')
  @ApiOperation({ summary: 'Ishchi rasmini olib tashlash' })
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePhoto(id);
  }

  @Get('events/:eventId/workers')
  @Permissions('events:read', 'staff:read')
  @ApiOperation({ summary: 'To‘yga biriktirilgan ishchilar' })
  listForEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.service.listForEvent(eventId);
  }

  @Post('events/:eventId/workers')
  @Permissions('events:read', 'staff:update')
  @ApiOperation({ summary: 'Ishchini to‘yga biriktirish' })
  assign(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: AssignWorkerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.assign(eventId, dto, actor);
  }

  @Delete('events/:eventId/workers/:workerId')
  @Permissions('events:read', 'staff:update')
  @ApiOperation({ summary: 'Ishchini to‘ydan olib tashlash' })
  unassign(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.service.unassign(eventId, workerId);
  }
}
