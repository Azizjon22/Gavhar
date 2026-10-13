import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseUnit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '@/common/validators/money';
import { IsQuantity } from '@/common/validators/quantity';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const MAX_LIST_ITEMS = 150;

export class KitchenEventsQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'Toshkent sanasi' })
  @Matches(DATE)
  from: string;

  @ApiProperty({ example: '2026-11-15' })
  @Matches(DATE)
  to: string;
}

export class ShoppingItemDto {
  @ApiPropertyOptional({ description: 'Mavjud qatorni o‘zgartirishda' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Kartoshka' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: WarehouseUnit })
  @IsEnum(WarehouseUnit)
  unit: WarehouseUnit;

  @ApiProperty({ example: '25' })
  @IsQuantity()
  quantity: string;

  @ApiPropertyOptional({ example: 'qizil, yirik', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SaveShoppingListDto {
  @ApiProperty({ type: [ShoppingItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ShoppingItemDto)
  items: ShoppingItemDto[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

/**
 * Bozorda odatda jami summa ma'lum (38 kg uchun 200 000) — shuning uchun narx jami
 * (`price`) yoki 1 birlik narxi (`unitPrice`) ko'rinishida yuboriladi, ikkalasidan biri.
 * `quantity` — amalda olingan miqdor, ro'yxatdagidan farq qilsa.
 */
export class PurchaseItemDto {
  @ApiPropertyOptional({ example: '38', description: 'Amalda olingan miqdor' })
  @IsOptional()
  @IsQuantity()
  quantity?: string;

  @ApiPropertyOptional({ example: '200000', description: 'Shu qator uchun to‘langan jami' })
  @ValidateIf((dto: PurchaseItemDto) => dto.unitPrice === undefined)
  @IsMoney()
  price?: string;

  @ApiPropertyOptional({ example: '5300', description: '1 birlik narxi (jami o‘rniga)' })
  @ValidateIf((dto: PurchaseItemDto) => dto.price === undefined)
  @IsMoney()
  unitPrice?: string;
}

/** Sotib olingan mahsulot narxini tuzatish (xato kiritilgan bo'lsa). */
export class FixItemPriceDto {
  @ApiPropertyOptional({ example: '200000' })
  @ValidateIf((dto: FixItemPriceDto) => dto.unitPrice === undefined)
  @IsMoney()
  price?: string;

  @ApiPropertyOptional({ example: '5300' })
  @ValidateIf((dto: FixItemPriceDto) => dto.price === undefined)
  @IsMoney()
  unitPrice?: string;
}
