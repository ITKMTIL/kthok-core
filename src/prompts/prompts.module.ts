import { Module } from '@nestjs/common';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { PromptsGateway } from './prompts.gateway';
import { PromptsService } from './prompts.service';

@Module({
  imports: [MatchmakingModule, RateLimitModule],
  providers: [PromptsGateway, PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
