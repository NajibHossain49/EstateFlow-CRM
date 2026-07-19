import { Module } from '@nestjs/common';
import { VisitsController } from './controllers/visits.controller';
import { VisitsService } from './services/visits.service';

@Module({
  controllers: [VisitsController],
  providers: [VisitsService],
})
export class VisitsModule {}
