import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  LeadPipelineItemDto,
  MonthlySummaryItemDto,
  OverviewResponseDto,
  PropertyDistributionResponseDto,
} from '../dto/dashboard-response.dto';
import { DashboardService } from '../services/dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ResponseMessage('Dashboard overview retrieved successfully')
  @ApiOperation({ summary: 'Aggregate KPIs across properties, clients, leads and visits' })
  @ApiOkResponse({ type: OverviewResponseDto })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOverview(user);
  }

  @Get('recent-activities')
  @ResponseMessage('Recent activities retrieved successfully')
  @ApiOperation({ summary: 'Latest 10 activities, newest first' })
  getRecentActivities(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getRecentActivities(user);
  }

  @Get('upcoming-visits')
  @ResponseMessage('Upcoming visits retrieved successfully')
  @ApiOperation({ summary: 'Scheduled visits within the next 7 days, soonest first' })
  getUpcomingVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getUpcomingVisits(user);
  }

  @Get('lead-pipeline')
  @ResponseMessage('Lead pipeline retrieved successfully')
  @ApiOperation({ summary: 'Lead counts grouped by status (zero-filled, enum order)' })
  @ApiOkResponse({ type: [LeadPipelineItemDto] })
  getLeadPipeline(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getLeadPipeline(user);
  }

  @Get('property-distribution')
  @ResponseMessage('Property distribution retrieved successfully')
  @ApiOperation({ summary: 'Property counts grouped by type and by status' })
  @ApiOkResponse({ type: PropertyDistributionResponseDto })
  getPropertyDistribution(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getPropertyDistribution(user);
  }

  @Get('monthly-summary')
  @ResponseMessage('Monthly summary retrieved successfully')
  @ApiOperation({ summary: 'Trailing 6 months of new leads, completed visits and won deals' })
  @ApiOkResponse({ type: [MonthlySummaryItemDto] })
  getMonthlySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getMonthlySummary(user);
  }
}
