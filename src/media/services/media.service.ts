import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Media, MediaEntityType, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { withDeleted } from '../../common/prisma/soft-delete';
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
            createdById: userId,
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
            updatedById: user.id,
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
      // id is the final tiebreaker so the order is fully deterministic even when
      // two rows share the same order/createdAt.
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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
        this.prisma.media.update({ where: { id }, data: { order: index, updatedById: user.id } }),
      ),
    );

    return this.findByProperty(propertyId);
  }

  /**
   * Soft delete: the row is stamped with deletedAt / deletedById so it disappears
   * from normal queries but can be restored. The stored asset is intentionally
   * kept so a restore can bring the media back; permanent asset cleanup is left
   * to a separate purge process. findOne already excludes soft-deleted rows, so
   * deleting an already-deleted media returns 404.
   */
  async remove(id: string, user: AuthenticatedUser): Promise<Media> {
    const media = await this.prisma.media.findFirst({ where: { id } });
    if (!media) {
      throw new ResourceNotFoundException('Media', id);
    }
    this.assertCanManage(media, user);

    return this.prisma.media.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
  }

  /** Restores a soft-deleted media record (owner or admin). */
  async restore(id: string, user: AuthenticatedUser): Promise<Media> {
    const media = await this.prisma.media.findFirst(withDeleted({ where: { id } }, true));
    if (!media) {
      throw new ResourceNotFoundException('Media', id);
    }
    this.assertCanManage(media, user);
    if (!media.deletedAt) {
      throw new BadRequestException('Media is not deleted');
    }

    return this.prisma.media.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, updatedById: user.id },
    });
  }

  private async ensurePropertyExists(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findFirst({
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
