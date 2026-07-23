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
import { CreateLeadDto } from '../dto/create-lead.dto';
import { QueryLeadsDto } from '../dto/query-leads.dto';
import { UpdateLeadDto } from '../dto/update-lead.dto';
import { LeadsService } from '../services/leads.service';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ResponseMessage('Lead created successfully')
  @ApiOperation({ summary: 'Create a lead (assigned to the logged-in user by default)' })
  create(@Body() dto: CreateLeadDto, @CurrentUser('id') userId: string) {
    return this.leadsService.create(dto, userId);
  }

  @Get()
  @ResponseMessage('Leads retrieved successfully')
  @ApiOperation({
    summary: 'List leads with search, filtering, sorting and pagination',
    description:
      'Supports page, limit, search (name/phone/email/source/notes), sortBy, sortOrder, ' +
      'status, source, assignedAgent, createdFrom, createdTo. Admins see all leads, agents see their own.',
  })
  findAll(@Query() query: QueryLeadsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.findAll(query, user);
  }

  @Get(':id')
  @ResponseMessage('Lead retrieved successfully')
  @ApiOperation({ summary: 'Get a lead by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.findOne(id, user);
  }

  @Patch(':id')
  @ResponseMessage('Lead updated successfully')
  @ApiOperation({ summary: 'Update a lead (assigned agent or admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Lead deleted successfully')
  @ApiOperation({ summary: 'Soft-delete a lead (assigned agent or admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.remove(id, user);
  }

  @Patch(':id/restore')
  @ResponseMessage('Lead restored successfully')
  @ApiOperation({ summary: 'Restore a soft-deleted lead (assigned agent or admin)' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.restore(id, user);
  }
}
