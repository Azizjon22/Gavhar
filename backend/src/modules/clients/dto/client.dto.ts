import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "+998 (90) 123-45-67" kabi yozuvni "+998901234567" ga keltiradi. */
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value;

export const UZ_PHONE = /^\+998\d{9}$/;
const PHONE_MESSAGE = "Telefon +998XXXXXXXXX formatida bo'lishi kerak";

export class CreateClientDto {
  @ApiProperty({ example: 'Karimov Anvar' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(normalizePhone)
  @Matches(UZ_PHONE, { message: PHONE_MESSAGE })
  phone: string;

  @ApiPropertyOptional({ example: '+998931112233', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @Transform(normalizePhone)
  @Matches(UZ_PHONE, { message: PHONE_MESSAGE })
  phoneExtra?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class UpdateClientDto extends PartialType(CreateClientDto) {}

export class ListClientsDto extends PaginationQueryDto {}
