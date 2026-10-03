import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { GATEWAY_OPTIONS } from '../config/gateway';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PromptsService } from './prompts.service';

const LIMIT: RateLimit = { max: 3, windowMs: 30_000 };

@WebSocketGateway(GATEWAY_OPTIONS)
export class PromptsGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly prompts: PromptsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @SubscribeMessage('chat:prompt')
  ask(@ConnectedSocket() client: Socket) {
    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    if (!room || !partner) return fail('not_in_chat');
    if (!this.rateLimit.allow(client.id, 'prompt', LIMIT)) {
      return fail('rate_limited');
    }

    const prompt = {
      id: randomUUID(),
      text: this.prompts.next(room.id, room.topic),
      at: Date.now(),
    };
    this.server
      .to(partner.socketId)
      .emit('chat:prompt', { ...prompt, mine: false });
    return { ok: true, prompt: { ...prompt, mine: true } };
  }
}
