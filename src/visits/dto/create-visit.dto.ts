import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { VisitStatus } from '@prisma/client';

export class CreateVisitDto {
  @ApiProperty({ format: 'uuid', description: 'ID of the client attending the visit' })
  @IsUUID()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({ format: 'uuid', description: 'ID of the property being visited' })
  @IsUUID()
  @IsNotEmpty()
  propertyId!: string;

  @ApiProperty({
    example: '2026-08-01T14:30:00.000Z',
    description: 'Scheduled date/time of the visit (ISO 8601)',
  })
  @IsDateString()
  @IsNotEmpty()
  visitDate!: string;

  @ApiProperty({ enum: VisitStatus, required: false, default: VisitStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(VisitStatus)
  status?: VisitStatus;

  @ApiProperty({ example: 'Client wants an afternoon viewing', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
