import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';

  @ApiProperty({ example: 'production' })
  environment: string;

  @ApiProperty({ example: 3600 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-10-06T12:00:00.000Z' })
  timestamp: string;
}

export class ReadinessDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';

  @ApiProperty({ example: { database: 'up', redis: 'up', storage: 'up' } })
  services: Record<'database' | 'redis' | 'storage', 'up' | 'down'>;
}
