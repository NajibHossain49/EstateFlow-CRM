import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus, PropertyStatus, PropertyType } from '@prisma/client';

export class OverviewResponseDto {
  @ApiProperty({ example: 42 })
  totalProperties!: number;

  @ApiProperty({ example: 30 })
  availableProperties!: number;

  @ApiProperty({ example: 8 })
  soldProperties!: number;

  @ApiProperty({ example: 4 })
  rentedProperties!: number;

  @ApiProperty({ example: 120 })
  totalClients!: number;

  @ApiProperty({ example: 75 })
  totalLeads!: number;

  @ApiProperty({
    description: 'Lead counts keyed by every LeadStatus value (zero-filled)',
    example: {
      NEW: 20,
      CONTACTED: 15,
      INTERESTED: 12,
      VISIT_SCHEDULED: 10,
      NEGOTIATION: 8,
      WON: 6,
      LOST: 4,
    },
    additionalProperties: { type: 'number' },
  })
  leadsByStatus!: Record<LeadStatus, number>;

  @ApiProperty({ example: 9 })
  scheduledVisits!: number;

  @ApiProperty({ example: 14 })
  completedVisits!: number;

  @ApiProperty({ example: 3 })
  cancelledVisits!: number;
}

export class LeadPipelineItemDto {
  @ApiProperty({ enum: LeadStatus, example: LeadStatus.NEW })
  status!: LeadStatus;

  @ApiProperty({ example: 20 })
  count!: number;
}

export class PropertyTypeCountDto {
  @ApiProperty({ enum: PropertyType, example: PropertyType.APARTMENT })
  propertyType!: PropertyType;

  @ApiProperty({ example: 18 })
  count!: number;
}

export class PropertyStatusCountDto {
  @ApiProperty({ enum: PropertyStatus, example: PropertyStatus.AVAILABLE })
  status!: PropertyStatus;

  @ApiProperty({ example: 30 })
  count!: number;
}

export class PropertyDistributionResponseDto {
  @ApiProperty({ type: [PropertyTypeCountDto] })
  byType!: PropertyTypeCountDto[];

  @ApiProperty({ type: [PropertyStatusCountDto] })
  byStatus!: PropertyStatusCountDto[];
}

export class MonthlySummaryItemDto {
  @ApiProperty({ example: '2026-07', description: 'Month bucket in YYYY-MM (UTC)' })
  month!: string;

  @ApiProperty({ example: 12 })
  newLeads!: number;

  @ApiProperty({ example: 7 })
  completedVisits!: number;

  @ApiProperty({ example: 3, description: 'Leads that moved to WON in the month' })
  wonDeals!: number;
}
