import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallModule } from '../call/call.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MusicModule } from '../music/music.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    AuthModule,
    CallModule,
    MatchmakingModule,
    MusicModule,
    RateLimitModule,
    ReactionsModule,
  ],
  providers: [ChatGateway],
})
export class ChatModule {}
