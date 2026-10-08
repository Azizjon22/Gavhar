import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Currency, EventStatus, EventType, PaymentKind, PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { IsMoney } from '@/common/validators/money';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Stol turi: bitta stolga necha kishi o'tiradi. */
export const TABLE_CAPACITIES = [10, 12] as const;

export class EventServiceItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  extraServiceId: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}

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

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Tanlangan menyu paketi. Narx baribir `pricePerGuest` da yuboriladi va bronda saqlanadi',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  menuPackageId?: string | null;

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

  @ApiPropertyOptional({
    example: '180000',
    description:
      "1 kishilik narx, so'mda. Pulni ko'rmaydigan rol yubormaydi — narx tanlangan menyu paketidan olinadi",
  })
  @IsOptional()
  @IsMoney()
  pricePerGuest?: string;

  @ApiPropertyOptional({ example: '0', description: "Chegirma, so'mda" })
  @IsOptional()
  @IsMoney()
  discount?: string;

  @ApiPropertyOptional({ type: [EventServiceItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique((item: EventServiceItemDto) => item.extraServiceId)
  @ValidateNested({ each: true })
  @Type(() => EventServiceItemDto)
  services?: EventServiceItemDto[];

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
  @ApiProperty({ enum: PaymentKind })
  @IsEnum(PaymentKind)
  kind: PaymentKind;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ enum: Currency, default: Currency.UZS })
  @IsEnum(Currency)
  currency: Currency;

  @ApiProperty({ example: '14000000', description: "To'lov valyutasidagi summa" })
  @IsMoney()
  amount: string;

  @ApiPropertyOptional({ example: '12650', description: "USD uchun majburiy: 1 dollar necha so'm" })
  @ValidateIf(
    (dto: CreatePaymentDto) => dto.currency === Currency.USD || dto.exchangeRate !== undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[1-9]\d{0,8}(\.\d{1,4})?$/, { message: "exchangeRate musbat son bo'lishi kerak" })
  exchangeRate?: string;

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
