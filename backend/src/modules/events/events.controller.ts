import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { AppException } from '@/common/errors/app.exception';
import { SYSTEM_ROLES } from '@/common/permissions/permission-catalog';
import { AuthUser } from '@/common/types/auth-user';
import { PdfService } from '@/infrastructure/pdf/pdf.service';
import {
  CalendarQueryDto,
  CancelEventDto,
  CreateEventDto,
  CreatePaymentDto,
  ListEventsDto,
  UpdateEventDto,
} from './dto/event.dto';
import { EventMoneyInterceptor, canSeeMoney } from './event-money.interceptor';
import { EventsService } from './events.service';
import { buildContract, buildReceipt } from './pdf/event-documents';

const pdfFile = (buffer: Buffer, filename: string) =>
  new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
    length: buffer.length,
  });

/**
 * 1- va 2-ovqat kelin-kuyov bilan kelishiladi — uni faqat SUPER_ADMIN belgilaydi.
 * Boshqa rol bu maydonlarni yuborsa (bo'shatish uchun ham), so'rov rad etiladi.
 */
function assertCanSetDishes(
  dto: { firstDish?: string | null; secondDish?: string | null },
  actor: AuthUser,
): void {
  if (
    actor.roleKey !== SYSTEM_ROLES.SUPER_ADMIN &&
    (dto.firstDish !== undefined || dto.secondDish !== undefined)
  ) {
    throw AppException.forbidden(
      'DISHES_SUPER_ADMIN_ONLY',
      '1-ovqat va 2-ovqatni faqat super admin belgilaydi',
    );
  }
}

@ApiTags('Bronlar')
@ApiBearerAuth()
@Controller('events')
@UseInterceptors(EventMoneyInterceptor)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  @Permissions('events:read')
  @ApiOperation({ summary: "Bronlar ro'yxati (filtr, qidiruv, sahifalash)" })
  list(@Query() query: ListEventsDto) {
    return this.eventsService.list(query);
  }

  @Get('calendar')
  @Permissions('events:read')
  @ApiOperation({ summary: "Kalendar uchun: sana oralig'idagi bronlar" })
  calendar(@Query() query: CalendarQueryDto) {
    return this.eventsService.calendar(query);
  }

  @Post()
  @Permissions('events:create')
  @ApiOperation({ summary: 'Yangi bron (summa serverda hisoblanadi)' })
  create(@Body() dto: CreateEventDto, @CurrentUser() actor: AuthUser) {
    assertCanSetDishes(dto, actor);
    return this.eventsService.create(dto, { priceFromPackage: !canSeeMoney(actor) });
  }

  @Get(':id')
  @Permissions('events:read')
  @ApiOperation({ summary: "Bron tafsiloti: hisob-kitob, xizmatlar, to'lovlar" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('events:update')
  @ApiOperation({ summary: 'Bronni tahrirlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() actor: AuthUser,
  ) {
    assertCanSetDishes(dto, actor);
    return this.eventsService.update(id, dto, { priceFromPackage: !canSeeMoney(actor) });
  }

  @Delete(':id')
  @Permissions('events:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "To'lovsiz so'rovni yoki bekor qilingan bronni o'chirish" })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.eventsService.remove(id);
  }

  @Post(':id/confirm')
  @Permissions('events:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Tasdiqlash (zaklad to'langan bo'lishi shart)" })
  confirm(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.confirm(id);
  }

  @Post(':id/hold')
  @Permissions('events:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Tadbir o'tkazildi deb belgilash" })
  hold(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.hold(id);
  }

  @Post(':id/complete')
  @Permissions('events:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Yakunlash (qarz to'liq yopilgan bo'lishi shart)" })
  complete(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.complete(id);
  }

  @Post(':id/cancel')
  @Permissions('events:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bekor qilish (sabab bilan)' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelEventDto) {
    return this.eventsService.cancel(id, dto.reason);
  }

  @Post(':id/payments')
  @Permissions('finance:create')
  @ApiOperation({ summary: "To'lov qabul qilish: zaklad, to'lov yoki qaytarish" })
  addPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.eventsService.addPayment(id, dto, actor);
  }

  @Delete(':id/payments/:paymentId')
  @Permissions('finance:delete')
  @ApiOperation({ summary: "To'lovni bekor qilish (tarixda saqlanadi)" })
  voidPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.eventsService.voidPayment(id, paymentId);
  }

  @Get(':id/contract')
  @Permissions('events:read', 'finance:read')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Shartnoma (PDF)' })
  async contract(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const event = await this.eventsService.findDetail(id);
    return pdfFile(await this.pdf.render(buildContract(event)), `shartnoma-${event.number}.pdf`);
  }

  @Get(':id/payments/:paymentId/receipt')
  @Permissions('events:read', 'finance:read')
  @Header('Cache-Control', 'no-store')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: "To'lov kvitansiyasi (PDF)" })
  async receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ): Promise<StreamableFile> {
    const event = await this.eventsService.findDetail(id);
    const payment = event.payments.find((item) => item.id === paymentId);
    if (!payment) throw AppException.notFound('PAYMENT_NOT_FOUND', "To'lov topilmadi");
    return pdfFile(
      await this.pdf.render(buildReceipt(event, payment)),
      `kvitansiya-${event.number}.pdf`,
    );
  }
}
