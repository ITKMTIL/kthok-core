import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';

@Module({
  imports: [MatchmakingModule, RateLimitModule],
  providers: [GamesGateway, GamesService],
  exports: [GamesService],
})
export class GamesModule {}
