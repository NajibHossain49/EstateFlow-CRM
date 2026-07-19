import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { LeadsModule } from './leads/leads.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    ClientsModule,
    LeadsModule,
  ],
})
export class AppModule {}
