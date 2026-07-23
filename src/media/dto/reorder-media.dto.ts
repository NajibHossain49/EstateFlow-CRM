import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { MAX_UPLOAD_COUNT } from '../config/multer.config';

export class ReorderMediaDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'All media IDs attached to the property, in the desired display order. ' +
      'The array position becomes the new order value (0-based).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_UPLOAD_COUNT)
  @IsUUID(undefined, { each: true })
  orderedIds!: string[];
}
