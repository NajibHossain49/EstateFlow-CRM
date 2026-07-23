import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * At least one lowercase letter, one uppercase letter, one digit and one special
 * character. Length is enforced separately so users get a clearer message.
 */
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export class RegisterDto {
  @ApiProperty({ example: 'Jane Doe', description: 'Full name of the user' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'jane.doe@example.com', description: 'Unique email address' })
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'Password123!',
    minLength: 8,
    description:
      'Account password: min 8 characters with uppercase, lowercase, number and special character',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  @Matches(STRONG_PASSWORD_REGEX, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password!: string;
}
