import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { WorkerPosition } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UZ_PHONE } from '@/modules/clients/dto/client.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value;

export class ListWorkersQueryDto {
  @ApiPropertyOptional({ enum: WorkerPosition })
  @IsOptional()
  @IsEnum(WorkerPosition)
  position?: WorkerPosition;
}

export class CreateWorkerDto {
  @ApiProperty({ example: 'Karimov Sardor' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: '+998901234567' })
  @Transform(normalizePhone)
  @Matches(UZ_PHONE, { message: "Telefon +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @ApiProperty({ enum: WorkerPosition })
  @IsEnum(WorkerPosition)
  position: WorkerPosition;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Faol emas ishchi to‘yga biriktirilmaydi' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWorkerDto extends PartialType(CreateWorkerDto) {}

export class AssignWorkerDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workerId: string;

  @ApiPropertyOptional({ example: 'Bosh ofitsiant', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  roleAtEvent?: string | null;
}
