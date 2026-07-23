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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Attach previously uploaded media to a property' })
  @ApiOkResponse({ type: MediaResponseDto, isArray: true })
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaService.attachToProperty(id, dto.mediaIds, user);
  }

  @Get()
  @ResponseMessage('Property media retrieved successfully')
  @ApiOperation({ summary: 'List a property’s images ordered by display order' })
  @ApiOkResponse({ type: MediaResponseDto, isArray: true })
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.findByProperty(id);
  }

  @Patch('order')
  @ResponseMessage('Property media order updated successfully')
  @ApiOperation({ summary: 'Update the display order of a property’s images' })
  @ApiOkResponse({ type: MediaResponseDto, isArray: true })
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.mediaService.reorderPropertyMedia(id, dto.orderedIds, user);
  }
}
