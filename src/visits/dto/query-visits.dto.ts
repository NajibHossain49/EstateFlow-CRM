import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { VisitStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const VISIT_SORT_FIELDS = ['visitDate', 'createdAt', 'updatedAt', 'status'] as const;

export type VisitSortField = (typeof VISIT_SORT_FIELDS)[number];

export class QueryVisitsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: VISIT_SORT_FIELDS,
    default: 'visitDate',
    description: 'Field to sort by',
  })
  @IsOptional()
  @IsIn(VISIT_SORT_FIELDS)
  sortBy: VisitSortField = 'visitDate';

  @ApiPropertyOptional({ enum: VisitStatus, description: 'Filter visits by status' })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter by agent id (admins only; agents are always scoped to their own)',
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by client id' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by property id' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({
    example: '2026-07-01T00:00:00.000Z',
    description: 'Only visits scheduled on/after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2026-07-31T23:59:59.999Z',
    description: 'Only visits scheduled on/before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}
