import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Media, MediaEntityType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ForbiddenActionException } from '../../common/exceptions/forbidden-action.exception';
import { ResourceNotFoundException } from '../../common/exceptions/resource-not-found.exception';
import {
  MEDIA_STORAGE_PROVIDER,
  MediaStorageProvider,
} from '../interfaces/media-storage-provider.interface';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE_PROVIDER) private readonly storage: MediaStorageProvider,
  ) {}

  /**
   * Uploads each file to the storage provider and persists an (unattached)
   * Media row owned by the current user. Attaching to an entity is a separate
   * step so uploads stay generic.
   */
  async upload(files: Express.Multer.File[], userId: string): Promise<Media[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('At least one file is required under the "files" field');
    }

    return Promise.all(
      files.map(async (file) => {
        const result = await this.storage.upload({
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype,
        });

        return this.prisma.media.create({
          data: {
            url: result.url,
            publicId: result.publicId,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            width: result.width ?? null,
            height: result.height ?? null,
            createdBy: userId,
          },
        });
      }),
    );
  }

  /** Attaches previously uploaded media to a property, appending to its order. */
  async attachToProperty(
    propertyId: string,
    mediaIds: string[],
    user: AuthenticatedUser,
  ): Promise<Media[]> {
    await this.ensurePropertyExists(propertyId);

    const mediaList = await this.prisma.media.findMany({ where: { id: { in: mediaIds } } });
    if (mediaList.length !== mediaIds.length) {
      throw new ResourceNotFoundException('Media');
    }

    for (const media of mediaList) {
      this.assertCanManage(media, user);
      if (media.entityId && media.entityId !== propertyId) {
        throw new BadRequestException(`Media ${media.id} is already attached to another entity`);
      }
    }

    const currentCount = await this.prisma.media.count({
      where: { entityType: MediaEntityType.PROPERTY, entityId: propertyId },
    });

    // Preserve the caller-supplied order, appending after existing images.
    await this.prisma.$transaction(
      mediaIds.map((id, index) =>
        this.prisma.media.update({
          where: { id },
          data: {
            entityType: MediaEntityType.PROPERTY,
            entityId: propertyId,
            order: currentCount + index,
          },
        }),
      ),
    );

    return this.findByProperty(propertyId);
  }

  /** Returns a property's images ordered by their display order. */
  async findByProperty(propertyId: string): Promise<Media[]> {
    await this.ensurePropertyExists(propertyId);

    return this.prisma.media.findMany({
      where: { entityType: MediaEntityType.PROPERTY, entityId: propertyId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Reorders a property's images. `orderedIds` must contain exactly the media
   * currently attached to the property; each item's index becomes its order.
   */
  async reorderPropertyMedia(
    propertyId: string,
    orderedIds: string[],
    user: AuthenticatedUser,
  ): Promise<Media[]> {
    await this.ensurePropertyExists(propertyId);

    const existing = await this.prisma.media.findMany({
      where: { entityType: MediaEntityType.PROPERTY, entityId: propertyId },
    });
    const existingIds = new Set(existing.map((m) => m.id));

    const sameSize = orderedIds.length === existing.length;
    const sameMembers = orderedIds.every((id) => existingIds.has(id));
    if (!sameSize || !sameMembers) {
      throw new BadRequestException(
        'orderedIds must contain exactly the media currently attached to this property',
      );
    }

    existing.forEach((media) => this.assertCanManage(media, user));

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.media.update({ where: { id }, data: { order: index } }),
      ),
    );

    return this.findByProperty(propertyId);
  }

  /** Deletes media from the storage provider and the database (owner or admin). */
  async remove(id: string, user: AuthenticatedUser): Promise<Media> {
    const media = await this.prisma.media.findUnique({ where: { id } });
    if (!media) {
      throw new ResourceNotFoundException('Media', id);
    }
    this.assertCanManage(media, user);

    await this.storage.delete(media.publicId);
    return this.prisma.media.delete({ where: { id } });
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new ResourceNotFoundException('Property', propertyId);
    }
  }

  private assertCanManage(media: Media, user: AuthenticatedUser): void {
    if (user.role !== Role.ADMIN && media.createdBy !== user.id) {
      throw new ForbiddenActionException('You can only manage media you uploaded');
    }
  }
}
