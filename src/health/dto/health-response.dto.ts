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

  @ApiProperty({
    example: 2.41,
    nullable: true,
    description: 'Database round-trip latency in milliseconds (null when the database is down)',
  })
  databaseLatencyMs!: number | null;

  @ApiProperty({ example: 12345, description: 'Process uptime in seconds' })
  uptime!: number;

  @ApiProperty({ example: '1.0.0', description: 'Deployed application version' })
  version!: string;

  @ApiProperty({ example: '2026-07-23T18:00:00.000Z', description: 'Server time (ISO 8601)' })
  timestamp!: string;
}
