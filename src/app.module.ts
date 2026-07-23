import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivitiesModule } from './activities/activities.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { ReportsModule } from './reports/reports.module';
import { PropertiesModule } from './properties/properties.module';
import { UsersModule } from './users/users.module';
import { VisitsModule } from './visits/visits.module';
import { PrismaModule } from './prisma/prisma.module';
import { AppConfigModule } from './config/config.module';
import { THROTTLE_TTL_MS, THROTTLE_DEFAULT_LIMIT } from './common/constants/security.constants';

@Module({
  imports: [
    AppConfigModule,
    // Global rate limiting: 100 requests / minute per client by default.
    // Stricter per-route limits (login/register) are applied with @Throttle.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: THROTTLE_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    ClientsModule,
    LeadsModule,
    VisitsModule,
    ActivitiesModule,
    DashboardModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    // Enforces the throttler on every route unless overridden/skipped.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
