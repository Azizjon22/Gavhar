import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { SuperAdminOnly } from '@/common/decorators/super-admin-only.decorator';
import { AuthUser } from '@/common/types/auth-user';
import { PdfService } from '@/infrastructure/pdf/pdf.service';
import {
  FixItemPriceDto,
  KitchenEventsQueryDto,
  PurchaseItemDto,
  SaveShoppingListDto,
} from './dto/shopping.dto';
import { buildShoppingList } from './pdf/shopping-list.pdf';
import { ShoppingService } from './shopping.service';

@ApiTags('Bozorlik')
@ApiBearerAuth()
@Controller('shopping')
export class ShoppingController {
  constructor(
    private readonly service: ShoppingService,
    private readonly pdf: PdfService,
  ) {}

  @Get('events')
  @Permissions('shopping:read')
  @ApiOperation({
    summary: 'Tadbirlar va ularning bozorlik ro‘yxatlari',
    description: 'Oshxona uchun ko‘rinish: tadbir pullari va mijoz telefoni qaytarilmaydi.',
  })
  listEvents(@Query() query: KitchenEventsQueryDto, @CurrentUser() actor: AuthUser) {
    return this.service.listEvents(query, actor);
  }

  @Get('suggestions')
  @Permissions('shopping:read')
  @ApiOperation({ summary: 'Ilgari yozilgan mahsulot nomlari' })
  suggestions() {
    return this.service.suggestions();
  }

  @Get('catalog')
  @Permissions('shopping:read')
  @ApiOperation({
    summary: 'Oshpaz uchun mahsulot katalogi',
    description: 'Ombordagi oziq-ovqat (turi, rasmi) va ilgari yozilgan mahsulotlar — narxsiz.',
  })
  catalog() {
    return this.service.catalog();
  }

  @Get('lists/mine')
  @Permissions('shopping:read')
  @ApiOperation({ summary: 'O‘zim yozgan ro‘yxatlar (oxirgi 30 ta)' })
  mine(@CurrentUser() actor: AuthUser) {
    return this.service.mine(actor);
  }

  @Get('pending')
  @Permissions('shopping:read')
  @ApiOperation({ summary: 'Foydalanuvchidan kutilayotgan ro‘yxatlar soni (bildirishnoma uchun)' })
  pending(@CurrentUser() actor: AuthUser) {
    return this.service.pending(actor);
  }

  @Post('seen')
  @Permissions('shopping:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Bozorlik sahifasi ochildi',
    description:
      'SUPER_ADMIN uchun yangi ro‘yxatlar «ko‘rildi» bo‘ladi, xaridchi uchun — unga yuborilganlar.',
  })
  async markSeen(@CurrentUser() actor: AuthUser): Promise<void> {
    await this.service.markSeen(actor);
  }

  @Get('lists/general')
  @Permissions('shopping:read')
  @ApiOperation({ summary: 'To‘yga bog‘lanmagan umumiy bozorlik ro‘yxatlari' })
  listGeneral(@CurrentUser() actor: AuthUser) {
    return this.service.listGeneral(actor);
  }

  @Post('lists')
  @Permissions('shopping:create')
  @ApiOperation({ summary: 'To‘yga bog‘lanmagan umumiy bozorlik yozish' })
  createGeneral(@Body() dto: SaveShoppingListDto, @CurrentUser() actor: AuthUser) {
    return this.service.create(null, dto, actor);
  }

  @Post('events/:eventId/lists')
  @Permissions('shopping:create')
  @ApiOperation({ summary: 'Tadbir uchun bozorlik yozish (oshpaz)' })
  create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: SaveShoppingListDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.create(eventId, dto, actor);
  }

  @Put('lists/:id')
  @Permissions('shopping:create')
  @ApiOperation({
    summary: 'Ro‘yxatni o‘zgartirish',
    description:
      'Oshpaz o‘zinikini SUPER_ADMIN ko‘rmasidan oldin; SUPER_ADMIN xarid tugaguncha (sotib olingan qatorlar qulflangan).',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveShoppingListDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Post('lists/:id/approve')
  @SuperAdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ko‘rib chiqildi — adminga xarid uchun yuborish (SUPER_ADMIN)' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id);
  }

  @Post('lists/:id/items/:itemId/purchase')
  @Permissions('shopping:purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mahsulot sotib olindi',
    description:
      'Amaldagi miqdor (ixtiyoriy) va narx — jami (`price`) yoki 1 birlik (`unitPrice`). Hamma qator tugagach ro‘yxat «sotib olingan» bo‘ladi.',
  })
  purchaseItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: PurchaseItemDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.purchaseItem(id, itemId, dto, actor);
  }

  @Post('lists/:id/items/:itemId/skip')
  @Permissions('shopping:purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mahsulot olinmadi deb belgilash' })
  skipItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.skipItem(id, itemId, actor);
  }

  @Post('lists/:id/items/:itemId/reset')
  @Permissions('shopping:purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Belgini bekor qilish — mahsulot yana «olinmagan»' })
  resetItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.resetItem(id, itemId, actor);
  }

  @Patch('lists/:id/items/:itemId/price')
  @Permissions('shopping:purchase')
  @ApiOperation({ summary: 'Sotib olingan mahsulot narxini tuzatish' })
  fixItemPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: FixItemPriceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.fixItemPrice(id, itemId, dto, actor);
  }

  @Post('lists/:id/confirm')
  @SuperAdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tasdiqlash — summa xarajatlarga yoziladi (SUPER_ADMIN)' })
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.service.confirm(id, actor);
  }

  @Post('lists/:id/unconfirm')
  @SuperAdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tasdiqni bekor qilish — xarajat hisobdan chiqadi (SUPER_ADMIN)' })
  unconfirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.unconfirm(id);
  }

  @Delete('lists/:id')
  @Permissions('shopping:create')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ro‘yxatni o‘chirish' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.service.remove(id, actor);
  }

  @Get('lists/:id/pdf')
  @Permissions('shopping:read')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Bozorlik ro‘yxati (PDF)' })
  async document(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const list = await this.service.findForDocument(id);
    return new StreamableFile(await this.pdf.render(buildShoppingList(list)), {
      type: 'application/pdf',
      disposition: `attachment; filename="bozorlik-${list.event?.number ?? 'umumiy'}.pdf"`,
    });
  }
}
