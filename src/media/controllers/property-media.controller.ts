import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AttachMediaDto } from '../dto/attach-media.dto';
import { MediaResponseDto } from '../dto/media-response.dto';
import { ReorderMediaDto } from '../dto/reorder-media.dto';
import { MediaService } from '../services/media.service';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('properties/:id/media')
export class PropertyMediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @ResponseMessage('Media attached to property successfully')
  @ApiOperation({
    summary: 'Attach previously uploaded media to a property',
    description:
      'Links already-uploaded media (by id) to the property and appends them after any ' +
      'existing images. Only the property owner or an admin may attach media.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property id.' })
  @ApiOkResponse({
    description: 'Media attached, ordered list returned.',
    type: MediaResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({ description: 'Invalid body (mediaIds must be non-empty UUIDs).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiForbiddenResponse({ description: 'You can only manage properties you created.' })
  @ApiNotFoundResponse({ description: 'Property or one of the media ids not found.' })
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaService.attachToProperty(id, dto.mediaIds, user);
  }

  @Get()
  @ResponseMessage('Property media retrieved successfully')
  @ApiOperation({
    summary: 'List a property’s images ordered by display order',
    description:
      'Returns the property images sorted by order, then createdAt, then id (deterministic).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property id.' })
  @ApiOkResponse({ description: 'Ordered property media.', type: MediaResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiNotFoundResponse({ description: 'Property not found.' })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.findByProperty(id);
  }

  @Patch('order')
  @ResponseMessage('Property media order updated successfully')
  @ApiOperation({
    summary: 'Update the display order of a property’s images',
    description:
      'Reassigns sequential order values from the supplied id list. Only the property owner ' +
      'or an admin may reorder media.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Property id.' })
  @ApiOkResponse({
    description: 'Reordered property media.',
    type: MediaResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({ description: 'Invalid body (orderedIds must be non-empty UUIDs).' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiForbiddenResponse({ description: 'You can only manage properties you created.' })
  @ApiNotFoundResponse({ description: 'Property or one of the media ids not found.' })
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaService.reorderPropertyMedia(id, dto.orderedIds, user);
  }
}
