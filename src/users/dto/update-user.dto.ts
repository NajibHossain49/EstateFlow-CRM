import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

// Updatable fields: name, email, role (password changes are handled separately).
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['password'] as const)) {}
