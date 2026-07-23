import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { PropertyStatus, PropertyType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const PROPERTY_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'price',
  'bedrooms',
  'bathrooms',
  'area',
  'title',
] as const;

export type PropertySortField = (typeof PROPERTY_SORT_FIELDS)[number];

export class QueryPropertiesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: PROPERTY_SORT_FIELDS,
    default: 'createdAt',
    description: 'Field to sort by',
  })
  @IsOptional()
  @IsIn(PROPERTY_SORT_FIELDS)
  sortBy: PropertySortField = 'createdAt';

  @ApiPropertyOptional({ enum: PropertyStatus, description: 'Filter by availability status' })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional({ enum: PropertyType, description: 'Filter by property type' })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ example: 100000, minimum: 0, description: 'Minimum price (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ example: 900000, minimum: 0, description: 'Maximum price (inclusive)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0, description: 'Minimum number of bedrooms' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minBedrooms?: number;

  @ApiPropertyOptional({ example: 5, minimum: 0, description: 'Maximum number of bedrooms' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxBedrooms?: number;
}
