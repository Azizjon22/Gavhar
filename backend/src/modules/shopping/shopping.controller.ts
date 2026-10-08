import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { KitchenEventsQueryDto, PurchaseDto, SaveShoppingListDto } from './dto/shopping.dto';
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

  @Get('pending')
  @Permissions('shopping:read')
  @ApiOperation({ summary: 'Foydalanuvchidan kutilayotgan ro‘yxatlar soni (bildirishnoma uchun)' })
  pending(@CurrentUser() actor: AuthUser) {
    return this.service.pending(actor);
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
    description: 'Tekshiruvgacha: oshpaz o‘zinikini, SUPER_ADMIN har qandayini.',
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

  @Put('lists/:id/purchase')
  @Permissions('shopping:purchase')
  @ApiOperation({ summary: 'Narxlarni kiritish va xaridni yakunlash (admin)' })
  purchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PurchaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.purchase(id, dto, actor);
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
