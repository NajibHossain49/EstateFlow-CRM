import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MAX_UPLOAD_COUNT, mediaMulterOptions } from '../config/multer.config';
import { MediaResponseDto } from '../dto/media-response.dto';
import { MediaService } from '../services/media.service';

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', MAX_UPLOAD_COUNT, mediaMulterOptions))
  @ResponseMessage('Media uploaded successfully')
  @ApiOperation({
    summary: 'Upload images',
    description:
      'Accepts multipart/form-data with up to 10 files under "files". ' +
      'Allowed types: jpg, jpeg, png, webp. Max 10 MB per file. Returns the created media records.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Media records created.',
    type: MediaResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'No file provided or unsupported file type (jpg, jpeg, png, webp only).',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiPayloadTooLargeResponse({ description: 'A file exceeds the 10 MB per-file limit.' })
  upload(@UploadedFiles() files: Express.Multer.File[], @CurrentUser('id') userId: string) {
    return this.mediaService.upload(files, userId);
  }

  @Delete(':id')
  @ResponseMessage('Media deleted successfully')
  @ApiOperation({
    summary: 'Soft-delete media (owner or admin)',
    description:
      'Marks the media as deleted (sets deletedAt/deletedById) so it no longer appears in ' +
      'normal queries but can be restored. The stored asset is retained for restore.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Media id.' })
  @ApiOkResponse({ description: 'Media soft-deleted.', type: MediaResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiNotFoundResponse({ description: 'Media not found (or already deleted).' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaService.remove(id, user);
  }

  @Patch(':id/restore')
  @ResponseMessage('Media restored successfully')
  @ApiOperation({
    summary: 'Restore a soft-deleted media record (owner or admin)',
    description: 'Clears deletedAt/deletedById so the media reappears in normal queries.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Media id.' })
  @ApiOkResponse({ description: 'Media restored.', type: MediaResponseDto })
  @ApiBadRequestResponse({ description: 'Media is not deleted.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT.' })
  @ApiNotFoundResponse({ description: 'Media not found.' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaService.restore(id, user);
  }
}
