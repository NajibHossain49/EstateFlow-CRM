import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Declares every environment variable the application depends on. Required
 * variables have no `@IsOptional()`, so `validateSync` fails when they are
 * missing — this is what makes the app fail fast at startup.
 */
class EnvironmentVariables {
  @IsEnum(NodeEnv, {
    message: `NODE_ENV must be one of: ${Object.values(NodeEnv).join(', ')}`,
  })
  NODE_ENV!: NodeEnv;

  @IsInt()
  @Min(0)
  @Max(65535)
  PORT!: number;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters long' })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(1)
  JWT_EXPIRES_IN!: string;

  // Optional Cloudinary credentials (media uploads).
  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  // Optional comma-separated CORS allow-list; defaults to "*" when unset.
  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
