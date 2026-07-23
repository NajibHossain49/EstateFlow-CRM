import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

/** Free-text search query parameter (trimmed; blank values are ignored). */
export class SearchQueryDto {
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
}
