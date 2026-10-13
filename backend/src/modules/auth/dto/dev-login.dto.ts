import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({ format: 'uuid', description: 'Qaysi rol bilan kirish' })
  @IsUUID()
  roleId: string;
}
