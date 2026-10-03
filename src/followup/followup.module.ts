import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { ReportsModule } from '../reports/reports.module';
import { FollowupGateway } from './followup.gateway';
import { FollowupService } from './followup.service';

@Module({
  imports: [RateLimitModule, ReportsModule],
  providers: [FollowupGateway, FollowupService],
  exports: [FollowupService],
})
export class FollowupModule {}
