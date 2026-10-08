import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** MOV — iPhone videolari; ular fonda MP4 ga aylantiriladi. */
export const VIDEO_CONTENT_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
/** Taqdimot videolari uchun yetarli; studiyaning katta asl fayllari alohida (bo'lakli) yuklanadi. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024 - 1;
export const MAX_ALBUM_ITEMS = 200;

export class CreateAlbumDto {
  @ApiProperty({ example: 'Stol bezatilishi' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Albom faqat shu menyu paketi sahifasida ko‘rinadi; null — hamma paketda',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  menuPackageId?: string | null;
}

export class UpdateAlbumDto extends PartialType(CreateAlbumDto) {}

export class InitVideoUploadDto {
  @ApiProperty({ enum: VIDEO_CONTENT_TYPES })
  @IsIn(VIDEO_CONTENT_TYPES)
  contentType: (typeof VIDEO_CONTENT_TYPES)[number];

  @ApiProperty({ description: 'Fayl hajmi, baytda' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VIDEO_BYTES)
  size: number;
}

export class CompleteVideoUploadDto {
  @ApiProperty({ description: '`init` javobidagi kalit' })
  @Matches(/^gallery\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov)$/)
  key: string;
}
