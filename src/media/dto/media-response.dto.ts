import { ApiProperty } from '@nestjs/swagger';
import { MediaEntityType } from '@prisma/client';

/** Swagger representation of a Media record. */
export class MediaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/upload/v1/estateflow/abc.jpg' })
  url!: string;

  @ApiProperty({ example: 'estateflow/abc' })
  publicId!: string;

  @ApiProperty({ example: 'living-room.jpg' })
  originalName!: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType!: string;

  @ApiProperty({ example: 245678, description: 'File size in bytes' })
  size!: number;

  @ApiProperty({ example: 1920, nullable: true })
  width!: number | null;

  @ApiProperty({ example: 1080, nullable: true })
  height!: number | null;

  @ApiProperty({
    enum: MediaEntityType,
    nullable: true,
    description: 'Owning entity type once attached',
  })
  entityType!: MediaEntityType | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Owning entity id once attached' })
  entityId!: string | null;

  @ApiProperty({ example: 0, description: 'Display order within the entity' })
  order!: number;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp (managed by Prisma @updatedAt)' })
  updatedAt!: Date;

  @ApiProperty({
    nullable: true,
    description: 'Soft-delete timestamp; null when the media is active',
  })
  deletedAt!: Date | null;
}
