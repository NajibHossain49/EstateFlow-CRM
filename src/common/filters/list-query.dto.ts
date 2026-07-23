import { ApiPropertyOptional, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../pagination/pagination-query.dto';
import { SortQueryDto } from '../sorting/sort-query.dto';
import { SearchQueryDto } from './search-query.dto';

/**
 * Base DTO for every list endpoint: `page`, `limit`, `sortOrder` and `search`.
 * `IntersectionType` merges the validation and Swagger metadata of all three
 * base DTOs into one class, which TypeScript's single-inheritance model cannot
 * express directly. Resource-specific DTOs extend this and add their own
 * `sortBy` allow-list and filter fields.
 */
export class ListQueryDto extends IntersectionType(
  PaginationQueryDto,
  IntersectionType(SortQueryDto, SearchQueryDto),
) {
  @ApiPropertyOptional({
    description:
      'Admins only: include soft-deleted records in the results. Ignored for non-admin users.',
    default: false,
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDeleted?: boolean;
}
