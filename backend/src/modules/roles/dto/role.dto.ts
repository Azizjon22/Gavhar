import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ALL_PERMISSION_KEYS, PermissionKey } from '@/common/permissions/permission-catalog';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateRoleDto {
  @ApiProperty({ example: 'Kassir' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ example: "To'lovlarni qabul qiladi", nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @ApiProperty({ example: ['finance:read', 'finance:create'], isArray: true, type: String })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(ALL_PERMISSION_KEYS.length)
  @IsIn(ALL_PERMISSION_KEYS, { each: true, message: "Noma'lum ruxsat: $value" })
  permissions: PermissionKey[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}
