import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { IsStrongPassword } from '@/common/validators/password-policy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const UZ_PHONE = /^\+998\d{9}$/;

export class CreateUserDto {
  @ApiProperty({ example: 'kassir@gavhar.uz' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Aliyev Vali' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiPropertyOptional({ example: '+998901234567', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(UZ_PHONE, { message: "Telefon +998XXXXXXXXX formatida bo'lishi kerak" })
  phone?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  roleId: string;

  @ApiProperty({
    description: 'Vaqtinchalik parol — foydalanuvchi birinchi kirishda almashtiradi',
  })
  @IsStrongPassword()
  password: string;
}

export class UpdateUserDto extends PartialType(
  PickType(CreateUserDto, ['email', 'fullName', 'phone', 'roleId'] as const),
) {}

export class ResetUserPasswordDto {
  @ApiProperty({ description: 'Yangi vaqtinchalik parol' })
  @IsStrongPassword()
  newPassword: string;
}

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
