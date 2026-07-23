import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsEnum } from 'class-validator';
import { LeadStatus } from '@prisma/client';
import { ListQueryDto } from '../../common/filters/list-query.dto';

export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'status'] as const;

export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

export class QueryLeadsDto extends ListQueryDto {
  @ApiPropertyOptional({
    enum: LEAD_SORT_FIELDS,
    default: 'createdAt',
    description: 'Field to sort by',
  })
  @IsOptional()
  @IsIn(LEAD_SORT_FIELDS)
  sortBy: LeadSortField = 'createdAt';

  @ApiPropertyOptional({ enum: LeadStatus, description: 'Filter leads by status' })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({
    example: 'FACEBOOK',
    description: 'Filter by lead source (case-insensitive partial match)',
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by assigned agent id (admins only; agents are always scoped to their own)',
  })
  @IsOptional()
  @IsUUID()
  assignedAgent?: string;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Only leads created on/after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Only leads created on/before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;
}
