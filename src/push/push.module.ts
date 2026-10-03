import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { PushGateway } from './push.gateway';
import { PushService } from './push.service';

@Module({
  imports: [RateLimitModule],
  providers: [PushGateway, PushService],
  exports: [PushService],
})
export class PushModule {}
