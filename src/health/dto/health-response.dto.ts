import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    example: 'ok',
    enum: ['ok', 'degraded'],
    description: 'Overall application status',
  })
  status!: 'ok' | 'degraded';

  @ApiProperty({ example: 'up', enum: ['up', 'down'], description: 'Database connectivity' })
  database!: 'up' | 'down';

  @ApiProperty({ example: 12345, description: 'Process uptime in seconds' })
  uptime!: number;

  @ApiProperty({ example: '1.0.0', description: 'Deployed application version' })
  version!: string;

  @ApiProperty({ example: '2026-07-23T18:00:00.000Z', description: 'Server time (ISO 8601)' })
  timestamp!: string;
}
