import { ApiProperty } from '@nestjs/swagger';
import { ActivityType } from '@prisma/client';

/**
 * Shape of an activity returned by the timeline endpoint. Documentation-only
 * (activities are never created directly via the API — they are recorded
 * automatically by the Lead and Visit modules).
 */
export class ActivityResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ActivityType })
  type!: ActivityType;

  @ApiProperty({ example: 'Lead status changed from NEW to CONTACTED' })
  description!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  leadId!: string | null;

  @ApiProperty({ format: 'uuid', description: 'User who performed the action' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}
