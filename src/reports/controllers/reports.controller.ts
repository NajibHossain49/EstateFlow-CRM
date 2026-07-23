import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExportReportQueryDto, ReportType, SalesReportQueryDto } from '../dto/report-query.dto';
import {
  AgentReportItemDto,
  LeadsReportDto,
  PropertiesReportDto,
  SalesReportDto,
  VisitsReportDto,
} from '../dto/report-response.dto';
import { ReportsService } from '../services/reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @ResponseMessage('Sales report retrieved successfully')
  @ApiOperation({
    summary: 'Sales totals (deals, revenue, average deal value) with optional date window',
  })
  @ApiOkResponse({ type: SalesReportDto })
  getSales(@Query() query: SalesReportQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getSales(query, user);
  }

  @Get('leads')
  @ResponseMessage('Leads report retrieved successfully')
  @ApiOperation({ summary: 'Lead counts grouped by status' })
  @ApiOkResponse({ type: LeadsReportDto })
  getLeads(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getLeads(user);
  }

  @Get('agents')
  @ResponseMessage('Agent report retrieved successfully')
  @ApiOperation({
    summary: 'Per-agent stats: total leads, visits, won deals and assigned properties',
  })
  @ApiOkResponse({ type: [AgentReportItemDto] })
  getAgents(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getAgents(user);
  }

  @Get('properties')
  @ResponseMessage('Properties report retrieved successfully')
  @ApiOperation({ summary: 'Property totals, per-status counts, average price and area' })
  @ApiOkResponse({ type: PropertiesReportDto })
  getProperties(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getProperties(user);
  }

  @Get('visits')
  @ResponseMessage('Visits report retrieved successfully')
  @ApiOperation({ summary: 'Visit status counts and completion rate' })
  @ApiOkResponse({ type: VisitsReportDto })
  getVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getVisits(user);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export a report as a downloadable CSV file' })
  @ApiQuery({ name: 'report', enum: ReportType, required: false })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file', schema: { type: 'string', format: 'binary' } })
  async exportCsv(
    @Query() query: ExportReportQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const { filename, content } = await this.reportsService.exportCsv(query, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(content);
  }
}
