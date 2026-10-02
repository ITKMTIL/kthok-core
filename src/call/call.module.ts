import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { CallGateway } from './call.gateway';
import { CallService } from './call.service';
import { TurnService } from './turn.service';

@Module({
  imports: [MatchmakingModule, RateLimitModule],
  providers: [CallGateway, CallService, TurnService],
  exports: [CallService],
})
export class CallModule {}
