import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { HallStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MAX_HALL_IMAGES = 10;

export class CreateHallDto {
  @ApiProperty({ example: 'Oltin zal' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 400, description: "Mehmonlar sig'imi" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  capacity: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ enum: HallStatus, default: HallStatus.ACTIVE })
  @IsOptional()
  @IsEnum(HallStatus)
  status?: HallStatus;
}

export class UpdateHallDto extends PartialType(CreateHallDto) {}

export class ListHallsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ enum: HallStatus })
  @IsOptional()
  @IsEnum(HallStatus)
  status?: HallStatus;
}

export class ReorderHallImagesDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Zalning barcha rasmlari yangi tartibda; birinchisi — muqova',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_HALL_IMAGES)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  imageIds: string[];
}
