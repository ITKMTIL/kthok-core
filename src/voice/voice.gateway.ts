import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import { CallService } from '../call/call.service';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { VOICE_ENABLED } from '../config/features';
import { GATEWAY_OPTIONS } from '../config/gateway';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PushService } from '../push/push.service';
import { ReactionsService } from '../reactions/reactions.service';
import { StatsService } from '../stats/stats.service';
import { detectAudioMime, readPeaks, toBuffer } from './utils/audio';

export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 512 * 1024;
export const VOICE_PEAKS = 48;

const LIMIT: RateLimit = { max: 6, windowMs: 60_000 };

@WebSocketGateway(GATEWAY_OPTIONS)
export class VoiceGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly reactions: ReactionsService,
    private readonly calls: CallService,
    private readonly stats: StatsService,
    private readonly rateLimit: RateLimitService,
    private readonly push: PushService,
  ) {}

  @SubscribeMessage('voice:send')
  send(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    if (!VOICE_ENABLED) return fail('disabled');

    const audio = toBuffer(body?.audio);
    if (!audio || audio.length === 0 || audio.length > MAX_VOICE_BYTES) {
      return fail('invalid_audio');
    }
    const mime = detectAudioMime(audio);
    if (!mime) return fail('invalid_audio');

    const duration = body?.duration;
    if (
      typeof duration !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > MAX_VOICE_SECONDS + 1
    ) {
      return fail('invalid_duration');
    }
    const peaks = readPeaks(body?.peaks, VOICE_PEAKS);
    if (!peaks) return fail('invalid_peaks');

    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    if (!room || !partner) return fail('not_in_chat');
    if (!this.rateLimit.allow(client.id, 'voice', LIMIT)) {
      return fail('rate_limited');
    }

    const message = {
      id: randomUUID(),
      at: Date.now(),
      duration: Math.min(duration, MAX_VOICE_SECONDS),
      peaks,
    };
    this.reactions.track(room.id, message.id);
    this.calls.noteMessage(room.id);
    this.stats.count('voice');
    this.server
      .to(partner.socketId)
      .emit('voice:message', { ...message, mime, audio });
    this.push.nudge(partner.socketId, 'message');
    return { ok: true, message: { ...message, mime } };
  }
}
