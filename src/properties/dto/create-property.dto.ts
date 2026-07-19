import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { PropertyStatus, PropertyType } from '@prisma/client';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Modern Downtown Apartment' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'A bright 2-bedroom apartment with skyline views.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: 320000, description: 'Price in the base currency' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 'Downtown, New York' })
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms!: number;

  @ApiProperty({ example: 95, description: 'Area in square meters', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  area!: number;

  @ApiProperty({ enum: PropertyType, example: PropertyType.APARTMENT })
  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @ApiProperty({ enum: PropertyStatus, required: false, default: PropertyStatus.AVAILABLE })
  @IsEnum(PropertyStatus)
  status: PropertyStatus = PropertyStatus.AVAILABLE;
}
