import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item: unknown) => (typeof item === 'string' ? item.trim() : item)).filter(Boolean)
    : value;

export class CreateMenuCategoryDto {
  @ApiProperty({ example: 'Salatlar' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nameUz: string;

  @ApiProperty({ example: 'Салаты' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nameRu: string;
}

export class UpdateMenuCategoryDto extends PartialType(CreateMenuCategoryDto) {}

export class ReorderDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Barcha IDlar yangi tartibda' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export class MenuSectionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 4, description: 'Necha xil' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  kindsCount: number;

  @ApiPropertyOptional({ type: [String], example: ['Sezar', 'Olivye'] })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  items?: string[];
}

export class CreateMenuPackageDto {
  @ApiProperty({ example: 'VIP' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ example: '280000', description: "1 kishilik narx, so'mda" })
  @IsMoney()
  pricePerGuest: string;

  @ApiPropertyOptional({ example: 'VIP', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(24)
  badge?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [MenuSectionDto] })
  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique((section: MenuSectionDto) => section.categoryId)
  @ValidateNested({ each: true })
  @Type(() => MenuSectionDto)
  sections: MenuSectionDto[];
}

export class UpdateMenuPackageDto extends PartialType(CreateMenuPackageDto) {}
