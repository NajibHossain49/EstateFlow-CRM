import { ApiProperty } from '@nestjs/swagger';
import { LeadStatus, Role } from '@prisma/client';

export class SalesReportDto {
  @ApiProperty({ example: 12, description: 'Number of properties marked SOLD in the window' })
  totalDeals!: number;

  @ApiProperty({ example: 4200000, description: 'Sum of the sale prices of those deals' })
  totalRevenue!: number;

  @ApiProperty({ example: 350000, description: 'totalRevenue / totalDeals (0 when no deals)' })
  averageDealValue!: number;
}

export class LeadStatusCountDto {
  @ApiProperty({ enum: LeadStatus, example: LeadStatus.NEW })
  status!: LeadStatus;

  @ApiProperty({ example: 8 })
  count!: number;
}

export class LeadsReportDto {
  @ApiProperty({ example: 40 })
  total!: number;

  @ApiProperty({ type: [LeadStatusCountDto] })
  byStatus!: LeadStatusCountDto[];
}

export class AgentReportItemDto {
  @ApiProperty({ format: 'uuid' })
  agentId!: string;

  @ApiProperty({ example: 'Alice Agent' })
  name!: string;

  @ApiProperty({ example: 'agent1@estateflow.com' })
  email!: string;

  @ApiProperty({ enum: Role, example: Role.AGENT })
  role!: Role;

  @ApiProperty({ example: 15 })
  totalLeads!: number;

  @ApiProperty({ example: 9 })
  totalVisits!: number;

  @ApiProperty({ example: 4 })
  wonDeals!: number;

  @ApiProperty({ example: 6 })
  assignedProperties!: number;
}

export class PropertiesReportDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 30 })
  available!: number;

  @ApiProperty({ example: 8 })
  sold!: number;

  @ApiProperty({ example: 4 })
  rented!: number;

  @ApiProperty({ example: 375000.5, description: 'Average sale price across all properties' })
  averagePrice!: number;

  @ApiProperty({ example: 1420.75, description: 'Average area across all properties' })
  averageArea!: number;
}

export class VisitsReportDto {
  @ApiProperty({ example: 9 })
  scheduled!: number;

  @ApiProperty({ example: 14 })
  completed!: number;

  @ApiProperty({ example: 3 })
  cancelled!: number;

  @ApiProperty({ example: 26 })
  total!: number;

  @ApiProperty({ example: 53.85, description: 'completed / total as a percentage (2 decimals)' })
  completionRate!: number;
}
