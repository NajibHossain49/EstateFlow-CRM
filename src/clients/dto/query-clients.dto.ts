import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const CLIENT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'budget',
  'preferredLocation',
] as const;

export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

export class QueryClientsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: CLIENT_SORT_FIELDS,
    default: 'createdAt',
    description: 'Field to sort by',
  })
  @IsOptional()
  @IsIn(CLIENT_SORT_FIELDS)
  sortBy: ClientSortField = 'createdAt';

  @ApiPropertyOptional({
    example: 'Gulshan',
    description: 'Filter by preferred location (case-insensitive partial match)',
  })
  @IsOptional()
  @IsString()
  preferredLocation?: string;

  @ApiPropertyOptional({ example: 1000000, minimum: 0, description: 'Minimum budget (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional({ example: 9000000, minimum: 0, description: 'Maximum budget (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxBudget?: number;
}
