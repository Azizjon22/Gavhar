import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MenuCourse, MenuPackageType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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

  @ApiPropertyOptional({
    enum: MenuCourse,
    description: 'Oshxona bosqichi: oshpaz bozorlikni salat, 1-ovqat, 2-ovqat tartibida yozadi',
  })
  @IsOptional()
  @IsEnum(MenuCourse)
  course?: MenuCourse;
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

  @ApiProperty({
    example: '32000000',
    description: "Butun paket narxi `guestCount` mehmon uchun, so'mda (1 kishilik narx emas)",
  })
  @IsMoney()
  price: string;

  @ApiProperty({ example: 100, description: 'Paket necha mehmonga mo‘ljallangan' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  guestCount: number;

  @ApiProperty({
    enum: MenuPackageType,
    description: "FULL — taomlar, kortej, san'atkor va kamerachi; FOOD_ONLY — faqat taomlar",
  })
  @IsEnum(MenuPackageType)
  packageType: MenuPackageType;

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
