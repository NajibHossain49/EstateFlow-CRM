import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Shared list query parameters. Every list endpoint extends this so pagination,
 * free-text search and sort direction behave identically across resources.
 * Each resource adds its own `sortBy` allow-list and filter fields.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1, description: 'Page number (1-based)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 100,
    default: 10,
    description: 'Items per page (max 100)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({
    example: 'apartment',
    description: 'Free-text search across the resource’s key text fields',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.DESC,
    description: 'Sort direction',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
