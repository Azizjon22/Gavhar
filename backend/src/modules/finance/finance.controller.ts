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
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { AuthUser } from '@/common/types/auth-user';
import {
  CreateExpenseDto,
  ExpenseCategoryDto,
  ListExpensesQueryDto,
  SummaryQueryDto,
  UpdateExpenseDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('Hisob-kitob')
@ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  @Get('summary')
  @Permissions('finance:read')
  @ApiOperation({
    summary: 'Davr bo‘yicha tushum, xarajat va sof foyda',
    description:
      'Faqat bo‘lib o‘tgan tadbirlar hisoblanadi; kelajakdagi bronlar alohida (`upcoming`) qaytadi.',
  })
  summary(@Query() query: SummaryQueryDto) {
    return this.service.summary(query);
  }

  @Get('events/:eventId')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Bitta to‘yning hisobi: olingan pul, xarajatlar, sof foyda' })
  eventFinance(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.service.eventFinance(eventId);
  }

  @Get('expenses')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Xarajatlar ro‘yxati' })
  listExpenses(@Query() query: ListExpensesQueryDto) {
    return this.service.listExpenses(query);
  }

  @Post('expenses')
  @Permissions('finance:create')
  @ApiOperation({ summary: 'Xarajat yozish' })
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() actor: AuthUser) {
    return this.service.createExpense(dto, actor);
  }

  @Patch('expenses/:id')
  @Permissions('finance:update')
  @ApiOperation({ summary: 'Xarajatni tuzatish' })
  updateExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto) {
    return this.service.updateExpense(id, dto);
  }

  @Delete('expenses/:id')
  @Permissions('finance:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xarajatni o‘chirish' })
  async removeExpense(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.removeExpense(id);
  }

  @Get('categories')
  @Permissions('finance:read')
  @ApiOperation({ summary: 'Xarajat turlari' })
  listCategories() {
    return this.service.listCategories();
  }

  @Post('categories')
  @Permissions('finance:manage-categories')
  @ApiOperation({ summary: 'Yangi xarajat turi' })
  createCategory(@Body() dto: ExpenseCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  @Permissions('finance:manage-categories')
  @ApiOperation({ summary: 'Xarajat turini qayta nomlash' })
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpenseCategoryDto) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Permissions('finance:manage-categories')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xarajat turini o‘chirish' })
  async removeCategory(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.removeCategory(id);
  }
}
