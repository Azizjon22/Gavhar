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
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { AuthUser } from '@/common/types/auth-user';
import { MAX_IMAGE_BYTES } from '@/infrastructure/storage/image-processor';
import {
  CreateItemDto,
  CreateMovementDto,
  ListItemsQueryDto,
  RecentMovementsQueryDto,
  SetLotPriceDto,
  StockCountDto,
  TakeStockDto,
  UpdateItemDto,
} from './dto/warehouse.dto';
import { StockUsageService } from './stock-usage.service';
import { WarehouseService, seesPrices } from './warehouse.service';

@ApiTags('Ombor')
@ApiBearerAuth()
@Controller('warehouse/items')
export class WarehouseController {
  constructor(private readonly service: WarehouseService) {}

  @Get()
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Ombordagi mahsulotlar (bo‘lim bo‘yicha)' })
  list(@Query() query: ListItemsQueryDto, @CurrentUser() actor: AuthUser) {
    return this.service.list(query, actor);
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
  recentMovements(@Query() query: RecentMovementsQueryDto, @CurrentUser() actor: AuthUser) {
    return this.service.recentMovements(query.limit, actor);
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
  listMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.listMovements(id, query, actor);
  }
}

/** Partiya narxlari va to'y uchun ombordan olish (oshpaz). */
@ApiTags('Ombor')
@ApiBearerAuth()
@Controller('warehouse')
export class StockUsageController {
  constructor(
    private readonly service: WarehouseService,
    private readonly usages: StockUsageService,
  ) {}

  @Patch('lots/:lotId')
  @SuperAdminOnly()
  @ApiOperation({ summary: 'Partiyaga narx qo‘yish (1 birlik, faqat SUPER_ADMIN)' })
  setLotPrice(@Param('lotId', ParseUUIDPipe) lotId: string, @Body() dto: SetLotPriceDto) {
    return this.service.setLotPrice(lotId, dto.unitPrice);
  }

  @Get('stock')
  @Permissions('warehouse:take')
  @ApiOperation({ summary: 'Oshpaz uchun ombor: oziq-ovqat va qoldig‘i (narxsiz)' })
  stock() {
    return this.usages.stock();
  }

  @Post('usages')
  @Permissions('warehouse:take')
  @ApiOperation({ summary: 'Bugungi yoki ertangi to‘y uchun ombordan mahsulot olish' })
  take(@Body() dto: TakeStockDto, @CurrentUser() actor: AuthUser) {
    return this.usages.take(dto, actor);
  }

  @Get('usages/mine')
  @Permissions('warehouse:take')
  @ApiOperation({ summary: 'O‘zim olganlarim (oxirgi 30 ta)' })
  mine(@CurrentUser() actor: AuthUser) {
    return this.usages.mine(actor);
  }

  @Get('usages')
  @Permissions('warehouse:read')
  @ApiOperation({ summary: 'Ombordan to‘ylar uchun olinganlar (narx — faqat SUPER_ADMIN)' })
  recent(@CurrentUser() actor: AuthUser) {
    return this.usages.recent(actor);
  }

  @Get('usages/event/:eventId')
  @Permissions('events:read')
  @ApiOperation({ summary: 'Bitta to‘y uchun ombordan olinganlar (narx — faqat SUPER_ADMIN)' })
  forEvent(@Param('eventId', ParseUUIDPipe) eventId: string, @CurrentUser() actor: AuthUser) {
    return this.usages.forEvent(eventId, seesPrices(actor));
  }

  @Delete('usages/:id')
  @Permissions('warehouse:take')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Olinganini qaytarish (oshpaz — o‘zi bugun olganini, SUPER_ADMIN — istalganini)',
  })
  async giveBack(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.usages.giveBack(id, actor);
  }
}
