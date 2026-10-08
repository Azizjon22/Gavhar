import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { IsMoney } from '@/common/validators/money';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const SUMMARY_GROUPS = ['day', 'month'] as const;
export type SummaryGroup = (typeof SUMMARY_GROUPS)[number];

export class SummaryQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'Davr boshi (Toshkent sanasi)' })
  @Matches(DATE)
  from: string;

  @ApiProperty({ example: '2026-10-31', description: 'Davr oxiri (shu kun ham kiradi)' })
  @Matches(DATE)
  to: string;

  @ApiPropertyOptional({ enum: SUMMARY_GROUPS, default: 'day' })
  @IsOptional()
  @IsIn(SUMMARY_GROUPS)
  groupBy: SummaryGroup = 'day';
}

export class ListExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @Matches(DATE)
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Faqat shu to‘yning xarajatlari' })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: '2500000' })
  @IsMoney()
  amount: string;

  @ApiPropertyOptional({
    example: '2026-10-07',
    description: 'Xarajat kuni — bugundan kech bo‘lmasin. To‘y xarajatida kerak emas',
  })
  @IsOptional()
  @Matches(DATE)
  date?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'To‘y xarajati (kamerachi, san’atkor, oshpazga to‘lov…): to‘y kuniga yoziladi va shu to‘yning sof foydasidan ayiriladi',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/** Xarajat qaysi to'yga tegishli ekani keyin o'zgartirilmaydi. */
export class UpdateExpenseDto extends PartialType(
  OmitType(CreateExpenseDto, ['eventId'] as const),
) {}

export class ExpenseCategoryDto {
  @ApiProperty({ example: 'Kommunal to‘lovlar' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}
