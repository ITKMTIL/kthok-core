import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MatchmakingService } from './matchmaking.service';
import { MusicService } from './music.service';

@Module({
  providers: [ChatGateway, MatchmakingService, MusicService],
})
export class ChatModule {}
