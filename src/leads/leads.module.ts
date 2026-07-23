import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { LeadsController } from './controllers/leads.controller';
import { LeadsService } from './services/leads.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
