import {
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
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
  @ApiOkResponse({ type: MediaResponseDto, isArray: true })
  upload(@UploadedFiles() files: Express.Multer.File[], @CurrentUser('id') userId: string) {
    return this.mediaService.upload(files, userId);
  }

  @Delete(':id')
  @ResponseMessage('Media deleted successfully')
  @ApiOperation({ summary: 'Delete media from storage and the database (owner or admin)' })
  @ApiOkResponse({ type: MediaResponseDto })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.mediaService.remove(id, user);
  }
}
