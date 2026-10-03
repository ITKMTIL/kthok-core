import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallModule } from '../call/call.module';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { FollowupModule } from '../followup/followup.module';
import { GamesModule } from '../games/games.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MusicModule } from '../music/music.module';
import { PromptsModule } from '../prompts/prompts.module';
import { PushModule } from '../push/push.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { ReportsModule } from '../reports/reports.module';
import { UsersModule } from '../users/users.module';
import { VoiceModule } from '../voice/voice.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [
    AuthModule,
    CallModule,
    FollowupModule,
    GamesModule,
    MatchmakingModule,
    MusicModule,
    PromptsModule,
    PushModule,
    RateLimitModule,
    ReactionsModule,
    ReportsModule,
    UsersModule,
    VoiceModule,
  ],
  providers: [ChatGateway],
})
export class ChatModule {}
