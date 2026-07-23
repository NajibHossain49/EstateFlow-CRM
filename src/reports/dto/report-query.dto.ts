import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum ReportType {
  SALES = 'sales',
  LEADS = 'leads',
  AGENTS = 'agents',
  PROPERTIES = 'properties',
  VISITS = 'visits',
}

/** Optional date window applied to the sales report (matches the sale timestamp). */
export class SalesReportQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00.000Z',
    description: 'Include deals closed on/after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59.999Z',
    description: 'Include deals closed on/before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ExportReportQueryDto extends SalesReportQueryDto {
  @ApiPropertyOptional({
    enum: ReportType,
    default: ReportType.SALES,
    description: 'Which report to export as CSV (from/to apply to the sales report)',
  })
  @IsOptional()
  @IsEnum(ReportType)
  report: ReportType = ReportType.SALES;
}
