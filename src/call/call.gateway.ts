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
import { CALL_ENABLED } from '../config/features';
import { GATEWAY_OPTIONS } from '../config/gateway';
import {
  MatchmakingService,
  Participant,
  Room,
} from '../matchmaking/matchmaking.service';
import { PushService } from '../push/push.service';
import { StatsService } from '../stats/stats.service';
import { CallService } from './call.service';
import { TurnService } from './turn.service';

const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS ?? 30_000);
const MAX_SIGNAL_LENGTH = 20_000;

const LIMITS = {
  invite: { max: 3, windowMs: 60_000 },
  ice: { max: 6, windowMs: 60_000 },
  signal: { max: 200, windowMs: 10_000 },
} satisfies Record<string, RateLimit>;

type EndReason = 'hangup' | 'declined' | 'no_answer';

@WebSocketGateway(GATEWAY_OPTIONS)
export class CallGateway {
  @WebSocketServer()
  private readonly server: Server;

  private readonly ringTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly calls: CallService,
    private readonly turn: TurnService,
    private readonly stats: StatsService,
    private readonly rateLimit: RateLimitService,
    private readonly push: PushService,
  ) {}

  @SubscribeMessage('call:invite')
  invite(@ConnectedSocket() client: Socket) {
    if (!CALL_ENABLED) return fail('disabled');
    const pair = this.pairOf(client);
    if (!pair) return fail('not_in_chat');
    const { room, partner } = pair;
    if (!this.calls.canCall(room.id)) return fail('too_early');
    if (!this.rateLimit.allow(client.id, 'call:invite', LIMITS.invite)) {
      return fail('rate_limited');
    }
    if (!this.calls.ring(room.id, client.id)) return fail('busy');

    this.ringTimers.set(
      room.id,
      setTimeout(() => this.finish(room, 'no_answer'), RING_TIMEOUT_MS),
    );
    this.server.to(partner.socketId).emit('call:incoming', { roomId: room.id });
    this.push.nudge(partner.socketId, 'call');
    return { ok: true };
  }

  @SubscribeMessage('call:ice')
  async ice(@ConnectedSocket() client: Socket) {
    const pair = this.pairOf(client);
    if (!pair || !this.calls.get(pair.room.id)) return fail('no_call');
    if (!this.rateLimit.allow(client.id, 'call:ice', LIMITS.ice)) {
      return fail('rate_limited');
    }
    const config = await this.turn.iceConfig();
    return config ? { ok: true, ...config } : fail('relay_unavailable');
  }

  @SubscribeMessage('call:accept')
  accept(@ConnectedSocket() client: Socket) {
    const pair = this.pairOf(client);
    if (!pair || !this.calls.accept(pair.room.id, client.id)) {
      return fail('no_call');
    }
    this.stopRinging(pair.room.id);
    this.stats.count('call');
    this.server
      .to(pair.partner.socketId)
      .emit('call:accepted', { roomId: pair.room.id });
    return { ok: true };
  }

  @SubscribeMessage('call:decline')
  decline(@ConnectedSocket() client: Socket) {
    const pair = this.pairOf(client);
    const call = pair && this.calls.get(pair.room.id);
    if (!pair || call?.status !== 'ringing') return;
    if (call.callerSocketId === client.id) return;
    this.finish(pair.room, 'declined', client.id);
  }

  @SubscribeMessage('call:end')
  end(@ConnectedSocket() client: Socket) {
    const pair = this.pairOf(client);
    if (!pair || !this.calls.get(pair.room.id)) return;
    this.finish(pair.room, 'hangup', client.id);
  }

  @SubscribeMessage('call:signal')
  signal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const pair = this.pairOf(client);
    if (!pair || this.calls.get(pair.room.id)?.status !== 'active') return;
    if (!this.rateLimit.allow(client.id, 'call:signal', LIMITS.signal)) return;

    const { description, candidate } = body ?? {};
    const payload = { roomId: pair.room.id, description, candidate };
    if (JSON.stringify(payload).length > MAX_SIGNAL_LENGTH) return;
    this.server.to(pair.partner.socketId).emit('call:signal', payload);
  }

  private pairOf(client: Socket): { room: Room; partner: Participant } | null {
    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    return room && partner ? { room, partner } : null;
  }

  private stopRinging(roomId: string) {
    clearTimeout(this.ringTimers.get(roomId));
    this.ringTimers.delete(roomId);
  }

  private finish(room: Room, reason: EndReason, exceptSocketId?: string) {
    this.stopRinging(room.id);
    if (!this.calls.end(room.id) || !room.guest) return;
    for (const participant of [room.owner, room.guest]) {
      if (participant.socketId === exceptSocketId) continue;
      this.server
        .to(participant.socketId)
        .emit('call:ended', { roomId: room.id, reason });
    }
  }
}
