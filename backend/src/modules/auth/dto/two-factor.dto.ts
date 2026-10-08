import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength, MinLength } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456', description: 'Authenticator ilovasidagi 6 xonali kod' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class TwoFactorLoginDto {
  @ApiProperty({ description: 'Login javobida berilgan vaqtinchalik token' })
  @IsString()
  @Length(20, 200)
  challengeToken: string;

  @ApiProperty({ example: '123456', description: '6 xonali kod yoki zaxira kod' })
  @IsString()
  @Length(6, 20)
  code: string;
}

export class DisableTwoFactorDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @ApiProperty({ description: '6 xonali kod yoki zaxira kod' })
  @IsString()
  @Length(6, 20)
  code: string;
}
