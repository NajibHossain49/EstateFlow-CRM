import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'John Carter' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '+1-202-555-0143' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'john.carter@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 400000, description: 'Client budget in the base currency' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budget!: number;

  @ApiProperty({ example: 'Downtown, New York' })
  @IsString()
  @IsNotEmpty()
  preferredLocation!: string;
}
