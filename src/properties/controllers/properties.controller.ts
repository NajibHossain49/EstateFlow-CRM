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
import { CreatePropertyDto } from '../dto/create-property.dto';
import { QueryPropertiesDto } from '../dto/query-properties.dto';
import { UpdatePropertyDto } from '../dto/update-property.dto';
import { PropertiesService } from '../services/properties.service';

@ApiTags('Properties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @ResponseMessage('Property created successfully')
  @ApiOperation({ summary: 'Create a property (owner set from the logged-in user)' })
  create(@Body() dto: CreatePropertyDto, @CurrentUser('id') userId: string) {
    return this.propertiesService.create(dto, userId);
  }

  @Get()
  @ResponseMessage('Properties retrieved successfully')
  @ApiOperation({
    summary: 'List properties with search, filtering, sorting and pagination',
    description:
      'Supports page, limit, search (title/description/location), sortBy, sortOrder, ' +
      'status, propertyType, minPrice, maxPrice, minBedrooms, maxBedrooms.',
  })
  findAll(@Query() query: QueryPropertiesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.propertiesService.findAll(query, user);
  }

  @Get(':id')
  @ResponseMessage('Property retrieved successfully')
  @ApiOperation({ summary: 'Get a property by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Property updated successfully')
  @ApiOperation({ summary: 'Update a property (owner or admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.propertiesService.update(id, dto, user);
  }

  @Delete(':id')
  @ResponseMessage('Property deleted successfully')
  @ApiOperation({ summary: 'Soft-delete a property (owner or admin)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.propertiesService.remove(id, user);
  }

  @Patch(':id/restore')
  @ResponseMessage('Property restored successfully')
  @ApiOperation({ summary: 'Restore a soft-deleted property (owner or admin)' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.propertiesService.restore(id, user);
  }
}
