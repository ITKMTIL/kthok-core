import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { isReaction } from '../common/constants/reactions';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { GATEWAY_OPTIONS } from '../config/gateway';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { ReactionsService } from './reactions.service';

const REACT_LIMIT: RateLimit = { max: 10, windowMs: 5_000 };

@WebSocketGateway(GATEWAY_OPTIONS)
export class ReactionsGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly reactions: ReactionsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @SubscribeMessage('chat:react')
  react(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const messageId = body?.messageId;
    const reaction = body?.reaction ?? null;
    if (typeof messageId !== 'string') return;
    if (reaction !== null && !isReaction(reaction)) return;

    const room = this.matchmaking.activeRoomOf(client.id);
    if (!room?.guest) return;
    if (!this.rateLimit.allow(client.id, 'react', REACT_LIMIT)) return;

    const reactions = this.reactions.react(
      room.id,
      messageId,
      client.id,
      reaction,
    );
    if (!reactions) return;

    for (const self of [room.owner, room.guest]) {
      const other = self === room.owner ? room.guest : room.owner;
      this.server.to(self.socketId).emit('chat:reaction', {
        roomId: room.id,
        messageId,
        mine: reactions.get(self.socketId) ?? null,
        theirs: reactions.get(other.socketId) ?? null,
      });
    }
  }
}
