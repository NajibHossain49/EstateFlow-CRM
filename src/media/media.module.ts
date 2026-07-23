import { Module } from '@nestjs/common';
import { MediaController } from './controllers/media.controller';
import { PropertyMediaController } from './controllers/property-media.controller';
import { MEDIA_STORAGE_PROVIDER } from './interfaces/media-storage-provider.interface';
import { CloudinaryProvider } from './providers/cloudinary.provider';
import { MediaService } from './services/media.service';

@Module({
  controllers: [MediaController, PropertyMediaController],
  providers: [
    MediaService,
    // Bind the storage abstraction to Cloudinary. Swap this single line to
    // change backends (e.g. an S3Provider) without touching the service.
    { provide: MEDIA_STORAGE_PROVIDER, useClass: CloudinaryProvider },
  ],
  exports: [MediaService],
})
export class MediaModule {}
