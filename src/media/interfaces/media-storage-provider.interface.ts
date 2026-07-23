/** Normalised result returned by any storage backend after an upload. */
export interface UploadedFileResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
}

/** Payload handed to a storage provider for a single upload. */
export interface MediaUploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

/**
 * Storage-provider abstraction. Any backend (Cloudinary, S3, local disk, ...)
 * implements this contract, so the service never depends on a concrete SDK.
 */
export interface MediaStorageProvider {
  upload(file: MediaUploadInput): Promise<UploadedFileResult>;
  delete(publicId: string): Promise<void>;
}

/** DI token used to inject the active storage provider (keeps it swappable). */
export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');
