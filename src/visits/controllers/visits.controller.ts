import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateVisitDto } from '../dto/create-visit.dto';
import { QueryVisitsDto } from '../dto/query-visits.dto';
import { UpdateVisitDto } from '../dto/update-visit.dto';
import { VisitsService } from '../services/visits.service';

@ApiTags('Visits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @ResponseMessage('Visit created successfully')
  @ApiOperation({ summary: 'Schedule a visit (agent set from the logged-in user)' })
  create(@Body() dto: CreateVisitDto, @CurrentUser('id') userId: string) {
    return this.visitsService.create(dto, userId);
  }

  @Get()
  @ResponseMessage('Visits retrieved successfully')
  @ApiOperation({
    summary: 'List visits with search, filtering, sorting and pagination',
    description:
      'Supports page, limit, search (notes/client name/property title), sortBy, sortOrder, ' +
      'status, agentId, clientId, propertyId, fromDate, toDate. Admins see all visits, agents see their own.',
  })
  findAll(@Query() query: QueryVisitsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.findAll(query, user);
  }

  @Get(':id')
  @ResponseMessage('Visit retrieved successfully')
  @ApiOperation({ summary: 'Get a visit by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.findOne(id, user);
  }

  @Patch(':id')
  @ResponseMessage('Visit updated successfully')
  @ApiOperation({ summary: 'Update a visit (assigned agent or admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVisitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visitsService.update(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Visit deleted successfully')
  @ApiOperation({ summary: 'Delete a visit (assigned agent or admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.remove(id, user);
  }
}
