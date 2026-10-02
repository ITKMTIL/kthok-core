import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MusicGateway } from './music.gateway';
import { MusicService } from './music.service';

@Module({
  imports: [MatchmakingModule, RateLimitModule],
  providers: [MusicGateway, MusicService],
  exports: [MusicService],
})
export class MusicModule {}
