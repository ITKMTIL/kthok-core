import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { GATEWAY_OPTIONS } from '../config/gateway';
import {
  MatchmakingService,
  Participant,
  Room,
} from '../matchmaking/matchmaking.service';
import {
  Game,
  GamesService,
  isGameType,
  isRpsChoice,
  viewOf,
} from './games.service';

const LIMITS = {
  start: { max: 4, windowMs: 30_000 },
  move: { max: 30, windowMs: 10_000 },
} satisfies Record<string, RateLimit>;

@WebSocketGateway(GATEWAY_OPTIONS)
export class GamesGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly games: GamesService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @SubscribeMessage('game:start')
  start(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const pair = this.pairOf(client);
    if (!pair) return fail('not_in_chat');
    if (!isGameType(body?.type)) return fail('invalid_game');
    if (!this.rateLimit.allow(client.id, 'game:start', LIMITS.start)) {
      return fail('rate_limited');
    }
    const game = this.games.start(
      pair.room.id,
      body.type,
      client.id,
      pair.partner.socketId,
    );
    this.broadcast(pair.room, game);
    return { ok: true };
  }

  @SubscribeMessage('game:move')
  move(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const pair = this.pairOf(client);
    if (!pair) return fail('not_in_chat');
    if (!this.rateLimit.allow(client.id, 'game:move', LIMITS.move)) {
      return fail('rate_limited');
    }
    const current = this.games.get(pair.room.id);
    let game: Game | null = null;
    if (current?.type === 'xo') {
      const cell = body?.cell;
      if (typeof cell !== 'number' || !Number.isInteger(cell)) {
        return fail('invalid_move');
      }
      if (cell < 0 || cell > 8) return fail('invalid_move');
      game = this.games.playXo(pair.room.id, client.id, cell);
    } else if (current?.type === 'rps') {
      if (!isRpsChoice(body?.choice)) return fail('invalid_move');
      game = this.games.playRps(pair.room.id, client.id, body.choice);
    }
    if (!game) return fail('invalid_move');
    this.broadcast(pair.room, game);
    return { ok: true };
  }

  @SubscribeMessage('game:end')
  end(@ConnectedSocket() client: Socket) {
    const pair = this.pairOf(client);
    if (!pair || !this.games.get(pair.room.id)) return;
    this.games.clear(pair.room.id);
    for (const participant of this.participants(pair.room)) {
      this.server.to(participant.socketId).emit('game:state', {
        roomId: pair.room.id,
        game: null,
      });
    }
  }

  private broadcast(room: Room, game: Game) {
    for (const participant of this.participants(room)) {
      this.server.to(participant.socketId).emit('game:state', {
        roomId: room.id,
        game: viewOf(game, participant.socketId),
      });
    }
  }

  private participants(room: Room): Participant[] {
    return room.guest ? [room.owner, room.guest] : [room.owner];
  }

  private pairOf(client: Socket): { room: Room; partner: Participant } | null {
    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    return room && partner ? { room, partner } : null;
  }
}
