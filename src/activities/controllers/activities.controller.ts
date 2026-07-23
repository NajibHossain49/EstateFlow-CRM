import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ActivitiesService } from '../services/activities.service';

@ApiTags('Activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leads/:id/activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ResponseMessage('Lead activities retrieved successfully')
  @ApiOperation({ summary: 'Get the activity timeline for a lead (latest first)' })
  findByLead(@Param('id', ParseUUIDPipe) leadId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.activitiesService.findByLead(leadId, user);
  }
}
