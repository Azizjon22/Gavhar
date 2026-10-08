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
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { AuthUser } from '@/common/types/auth-user';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import {
  CreateItemDto,
  CreateMovementDto,
  ListItemsQueryDto,
  RecentMovementsQueryDto,
  StockCountDto,
  UpdateItemDto,
} from './dto/warehouse.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('Ombor')
@ApiBearerAuth()
@Controller('warehouse/items')
export class WarehouseController {
  constructor(private readonly service: WarehouseService) {}

  @Get()
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Ombordagi mahsulotlar (bo‘lim bo‘yicha)' })
  list(@Query() query: ListItemsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @Permissions('warehouse:create')
  @ApiOperation({ summary: 'Yangi mahsulot' })
  create(@Body() dto: CreateItemDto, @CurrentUser() actor: AuthUser) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @Permissions('warehouse:update')
  @ApiOperation({
    summary: 'Mahsulot ma’lumotini o‘zgartirish (qoldiq — faqat kirim/chiqim orqali)',
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Permissions('warehouse:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mahsulotni o‘chirish' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }

  @Get('recent-movements')
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Butun ombor bo‘yicha so‘nggi kirim-chiqimlar' })
  recentMovements(@Query() query: RecentMovementsQueryDto) {
    return this.service.recentMovements(query.limit);
  }

  @Post(':id/count')
  @Permissions('warehouse:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inventarizatsiya: haqiqiy miqdorni kiritish' })
  count(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockCountDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.count(id, dto, actor);
  }

  @Post(':id/photo')
  @Permissions('warehouse:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Mahsulot rasmi (JPEG, PNG, WebP, AVIF; 10 MB gacha)' })
  setPhoto(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.service.setPhoto(id, file);
  }

  @Delete(':id/photo')
  @Permissions('warehouse:update')
  @ApiOperation({ summary: 'Mahsulot rasmini olib tashlash' })
  removePhoto(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removePhoto(id);
  }

  @Post(':id/movements')
  @Permissions('warehouse:update')
  @ApiOperation({ summary: 'Kirim yoki chiqim' })
  addMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMovementDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.addMovement(id, dto, actor);
  }

  @Get(':id/movements')
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Mahsulot bo‘yicha kirim-chiqim tarixi' })
  listMovements(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.service.listMovements(id, query);
  }
}
