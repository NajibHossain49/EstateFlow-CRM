import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LeadStatus } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty({ example: 'John Prospect' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '01700000000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ example: 'john.prospect@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Facebook Ad', description: 'Where the lead came from' })
  @IsString()
  @IsNotEmpty()
  source!: string;

  @ApiProperty({ enum: LeadStatus, required: false, default: LeadStatus.NEW })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiProperty({ example: 'Interested in 3-bedroom apartments', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
