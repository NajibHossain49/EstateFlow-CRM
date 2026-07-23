import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import {
  MediaStorageProvider,
  MediaUploadInput,
  UploadedFileResult,
} from '../interfaces/media-storage-provider.interface';

/**
 * Cloudinary implementation of {@link MediaStorageProvider}. Credentials come
 * from the (optional) CLOUDINARY_* env vars; when they are absent the provider
 * stays inert and throws a clear error only if an upload is actually attempted,
 * so the rest of the app boots normally.
 */
@Injectable()
export class CloudinaryProvider implements MediaStorageProvider {
  private readonly logger = new Logger(CloudinaryProvider.name);
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>('cloudinary.cloudName');
    const apiKey = config.get<string>('cloudinary.apiKey');
    const apiSecret = config.get<string>('cloudinary.apiSecret');

    this.configured = Boolean(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary is not configured (missing CLOUDINARY_* env vars); media uploads will be rejected until it is set up.',
      );
    }
  }

  upload(file: MediaUploadInput): Promise<UploadedFileResult> {
    this.assertConfigured();

    return new Promise<UploadedFileResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'estateflow', resource_type: 'image' },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload returned no result'));
            return;
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
          });
        },
      );
      stream.end(file.buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    this.assertConfigured();
    await cloudinary.uploader.destroy(publicId);
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new InternalServerErrorException('Media storage (Cloudinary) is not configured');
    }
  }
}
