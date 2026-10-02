import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MatchmakingService } from './matchmaking.service';

@Module({
  providers: [ChatGateway, MatchmakingService],
})
export class ChatModule {}
