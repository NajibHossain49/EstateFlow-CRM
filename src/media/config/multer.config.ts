import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';

/** Maximum accepted size per file: 10 MB. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of files accepted in a single upload request. */
export const MAX_UPLOAD_COUNT = 10;

/** Allowed image MIME types (jpg, jpeg, png, webp). */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

type MulterFileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

/**
 * Multer options for media uploads. Files are held in memory (buffers) so they
 * can be streamed straight to the storage provider without touching disk.
 * MIME type is validated here; size/count limits are enforced by Multer.
 */
export const mediaMulterOptions = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_UPLOAD_COUNT,
  },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: MulterFileFilterCallback): void => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          `Unsupported file type "${file.mimetype}". Allowed types: jpg, jpeg, png, webp`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};
