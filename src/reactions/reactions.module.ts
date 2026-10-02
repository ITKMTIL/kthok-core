import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { ReactionsGateway } from './reactions.gateway';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [MatchmakingModule, RateLimitModule],
  providers: [ReactionsGateway, ReactionsService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
