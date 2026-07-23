import { Module } from '@nestjs/common';
import { ActivitiesModule } from '../activities/activities.module';
import { VisitsController } from './controllers/visits.controller';
import { VisitsService } from './services/visits.service';

@Module({
  imports: [ActivitiesModule],
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
