import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ProductCategory,
  StockMovementType,
  WarehouseSection,
  WarehouseUnit,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsMoney } from '@/common/validators/money';
import { IsQuantity } from '@/common/validators/quantity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListItemsQueryDto {
  @ApiPropertyOptional({ enum: WarehouseSection })
  @IsOptional()
  @IsEnum(WarehouseSection)
  section?: WarehouseSection;
}

export class CreateItemDto {
  @ApiProperty({ enum: WarehouseSection })
  @IsEnum(WarehouseSection)
  section: WarehouseSection;

  @ApiProperty({ example: 'Guruch (lazer)' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ enum: WarehouseUnit })
  @IsEnum(WarehouseUnit)
  unit: WarehouseUnit;

  @ApiPropertyOptional({
    enum: ProductCategory,
    nullable: true,
    description: 'Mahsulot turi — faqat oziq-ovqat bo‘limida',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(ProductCategory)
  productCategory?: ProductCategory | null;

  @ApiPropertyOptional({ example: '20', description: 'Shu miqdorga tushsa "kam qoldi"' })
  @IsOptional()
  @IsQuantity()
  minQuantity?: string;

  @ApiPropertyOptional({ example: '150', description: 'Boshlang‘ich qoldiq' })
  @IsOptional()
  @IsQuantity()
  initialQuantity?: string;

  @ApiPropertyOptional({
    example: '4500000',
    description:
      "Boshlang'ich qoldiqning xarid summasi — faqat SUPER_ADMIN (boshqalarniki e'tiborga olinmaydi)",
  })
  @IsOptional()
  @IsMoney()
  initialCost?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

/** Bo'lim va qoldiq o'zgartirilmaydi: qoldiq faqat kirim/chiqim orqali. */
export class UpdateItemDto extends PartialType(
  OmitType(CreateItemDto, ['section', 'initialQuantity', 'initialCost'] as const),
) {}

export class SetLotPriceDto {
  @ApiProperty({ example: '18000', description: "1 birlik narxi, so'mda" })
  @IsMoney()
  unitPrice: string;
}

export class CreateMovementDto {
  @ApiProperty({ enum: StockMovementType })
  @IsEnum(StockMovementType)
  type: StockMovementType;

  @ApiProperty({ example: '25' })
  @IsQuantity()
  quantity: string;

  @ApiPropertyOptional({
    example: '4500000',
    description:
      "Faqat kirimda va faqat SUPER_ADMIN: xarid summasi — undan 1 birlik narxi (partiya) olinadi. Hisob-kitobga qo'shilmaydi",
  })
  @IsOptional()
  @IsMoney()
  totalCost?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class StockCountDto {
  @ApiProperty({ example: '37.5', description: 'Sanab chiqilgan haqiqiy miqdor' })
  @IsQuantity()
  actual: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class RecentMovementsQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class TakeStockItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '12.5' })
  @IsQuantity()
  quantity: string;
}

/** Oshpaz bitta to'y uchun ombordan oladigan mahsulotlar. */
export class TakeStockDto {
  @ApiProperty({ format: 'uuid', description: "Bugungi yoki ertangi to'y" })
  @IsUUID()
  eventId: string;

  @ApiProperty({ type: [TakeStockItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TakeStockItemDto)
  items: TakeStockItemDto[];
}
