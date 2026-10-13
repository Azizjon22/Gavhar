import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { EventStatus, EventType, PaymentKind, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { IsMoney } from '@/common/validators/money';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Stol turi: bitta stolga necha kishi o'tiradi. */
export const TABLE_CAPACITIES = [10, 12] as const;

export class CreateEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  hallId: string;

  @ApiProperty({ enum: EventType })
  @IsEnum(EventType)
  type: EventType;

  @ApiProperty({
    format: 'uuid',
    description: "Menyu paketi. To'y narxi shu paket narxidan olinadi va bronda qotib qoladi",
  })
  @IsUUID()
  menuPackageId: string;

  @ApiPropertyOptional({ enum: TABLE_CAPACITIES, nullable: true, description: 'Stol turi' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsIn(TABLE_CAPACITIES)
  tableCapacity?: number | null;

  @ApiPropertyOptional({
    example: 'Osh',
    nullable: true,
    description: 'Kelin-kuyov tanlagan 1-ovqat. Faqat SUPER_ADMIN belgilaydi',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  firstDish?: string | null;

  @ApiPropertyOptional({ example: 'Qozon kabob', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  secondDish?: string | null;

  @ApiPropertyOptional({ example: 'Anvar va Nodira to‘yi', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endAt: Date;

  @ApiProperty({ example: 300 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  guestCount: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class ListEventsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EventStatus })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  hallId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Faqat qarzi bor bronlar' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  debtOnly?: boolean;
}

export class CalendarQueryDto {
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  from: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  to: Date;
}

export class CancelEventDto {
  @ApiProperty({ example: 'Mijoz sanani o‘zgartirdi' })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class CreatePaymentDto {
  @ApiProperty({ enum: PaymentKind, description: 'REFUND — mijozga qaytarilgan pul' })
  @IsEnum(PaymentKind)
  kind: PaymentKind;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ example: '14000000', description: "Summa, so'mda" })
  @IsMoney()
  amount: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
