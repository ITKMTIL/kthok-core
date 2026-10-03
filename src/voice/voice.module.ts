import { Module } from '@nestjs/common';
import { CallModule } from '../call/call.module';
import { FollowupModule } from '../followup/followup.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { PushModule } from '../push/push.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { VoiceGateway } from './voice.gateway';

@Module({
  imports: [
    PushModule,
    CallModule,
    FollowupModule,
    MatchmakingModule,
    RateLimitModule,
    ReactionsModule,
  ],
  providers: [VoiceGateway],
})
export class VoiceModule {}
