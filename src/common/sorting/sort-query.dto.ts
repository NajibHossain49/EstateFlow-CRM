import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Sort-direction query parameter. `sortBy` is declared per-resource with an
 * `@IsIn` allow-list so only known, safe columns can be sorted on.
 */
export class SortQueryDto {
  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC, description: 'Sort direction' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;
}
