import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '@/common/validators/password-policy';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ description: 'Kamida 12 belgi: katta va kichik harf, raqam, maxsus belgi' })
  @IsStrongPassword()
  newPassword: string;
}
