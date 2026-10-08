import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarehouseUnit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

export class PurchaseItemDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ example: '25', description: 'Amalda olingan miqdor' })
  @IsQuantity()
  quantity: string;

  @ApiPropertyOptional({ example: '125000', nullable: true, description: 'Shu qator uchun jami' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsMoney()
  price?: string | null;

  @ApiPropertyOptional({ default: false, description: 'Sotib olinmadi' })
  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}

export class PurchaseDto {
  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LIST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @ApiProperty({ description: 'true — xarid tugadi; false — faqat kiritilganini saqlash' })
  @IsBoolean()
  complete: boolean;
}
