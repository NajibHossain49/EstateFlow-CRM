import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';
import { MAX_UPLOAD_COUNT } from '../config/multer.config';

export class AttachMediaDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'IDs of previously uploaded media to attach to the property',
    example: ['b3f1c2a4-0000-4000-8000-000000000001'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_UPLOAD_COUNT)
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
}
