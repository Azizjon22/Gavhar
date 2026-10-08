import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DishNameDto {
  @ApiProperty({ example: 'Qozon kabob' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;
}

export class SaveDishDto extends DishNameDto {
  @ApiPropertyOptional({ nullable: true, example: 'Mol go‘shti, kartoshka, ziravorlar' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  description?: string | null;
}
