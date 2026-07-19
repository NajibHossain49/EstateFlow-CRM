import { Module } from '@nestjs/common';
import { LeadsController } from './controllers/leads.controller';
import { LeadsService } from './services/leads.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
