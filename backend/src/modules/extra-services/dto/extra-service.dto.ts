import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ExtraServiceUnit } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsMoney } from '@/common/validators/money';

export class CreateExtraServiceDto {
  @ApiProperty({ example: 'Zal bezagi' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: '3000000' })
  @IsMoney()
  price: string;

  @ApiProperty({ enum: ExtraServiceUnit })
  @IsEnum(ExtraServiceUnit)
  unit: ExtraServiceUnit;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateExtraServiceDto extends PartialType(CreateExtraServiceDto) {}
