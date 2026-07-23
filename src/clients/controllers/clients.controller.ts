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
import { CreateClientDto } from '../dto/create-client.dto';
import { QueryClientsDto } from '../dto/query-clients.dto';
import { UpdateClientDto } from '../dto/update-client.dto';
import { ClientsService } from '../services/clients.service';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ResponseMessage('Client created successfully')
  @ApiOperation({ summary: 'Create a client (owner set from the logged-in user)' })
  create(@Body() dto: CreateClientDto, @CurrentUser('id') userId: string) {
    return this.clientsService.create(dto, userId);
  }

  @Get()
  @ResponseMessage('Clients retrieved successfully')
  @ApiOperation({
    summary: 'List clients with search, filtering, sorting and pagination',
    description:
      'Supports page, limit, search (name/phone/email/location), sortBy, sortOrder, ' +
      'preferredLocation, minBudget, maxBudget. Admins see all clients, agents see their own.',
  })
  findAll(@Query() query: QueryClientsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findAll(query, user);
  }

  @Get(':id')
  @ResponseMessage('Client retrieved successfully')
  @ApiOperation({ summary: 'Get a client by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.findOne(id, user);
  }

  @Patch(':id')
  @ResponseMessage('Client updated successfully')
  @ApiOperation({ summary: 'Update a client (owner or admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Client deleted successfully')
  @ApiOperation({ summary: 'Delete a client (owner or admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clientsService.remove(id, user);
  }
}
