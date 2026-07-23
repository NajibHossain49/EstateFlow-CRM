import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './configuration';
import { validateEnv } from './env.validation';

/**
 * Centralises application configuration. Loads typed config via `configuration`
 * and validates the environment at startup with `validateEnv`, so the app fails
 * fast when a required variable is missing or malformed. Registered globally so
 * `ConfigService` is injectable everywhere without re-importing.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
