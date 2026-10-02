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
import { fetchVideoTitle, parseVideoId } from '../common/utils/youtube';
import { ALLOWED_ORIGINS } from '../config/origins';
import { MatchmakingService, Room } from '../matchmaking/matchmaking.service';
import { MusicService } from './music.service';

const MAX_URL_LENGTH = 200;

const LIMITS = {
  addTrack: { max: 3, windowMs: 10_000 },
  musicControl: { max: 12, windowMs: 5_000 },
} satisfies Record<string, RateLimit>;

@WebSocketGateway({ cors: { origin: ALLOWED_ORIGINS } })
export class MusicGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly music: MusicService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @SubscribeMessage('music:add')
  async addTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const url = typeof body?.url === 'string' ? body.url : '';
    const videoId = url.length <= MAX_URL_LENGTH ? parseVideoId(url) : null;
    if (!videoId) return fail('invalid_url');

    const before = this.matchmaking.activeRoomOf(client.id);
    if (!before) return fail('not_in_chat');
    if (!this.allow(client, 'addTrack')) return fail('rate_limited');

    const title = await fetchVideoTitle(videoId);
    if (title === null) return fail('video_unavailable');

    const room = this.matchmaking.activeRoomOf(client.id);
    if (room?.id !== before.id) return fail('not_in_chat');

    const self = room.owner.socketId === client.id ? room.owner : room.guest;
    const track = this.music.add(room.id, {
      videoId,
      title,
      addedBy: self?.nickname ?? '',
    });
    if (!track) return fail('queue_full');

    this.broadcastMusic(room);
    return { ok: true };
  }

  @SubscribeMessage('music:play')
  playMusic(@ConnectedSocket() client: Socket) {
    const room = this.controllableRoom(client);
    if (room && this.music.play(room.id)) this.broadcastMusic(room);
  }

  @SubscribeMessage('music:pause')
  pauseMusic(@ConnectedSocket() client: Socket) {
    const room = this.controllableRoom(client);
    if (room && this.music.pause(room.id)) this.broadcastMusic(room);
  }

  @SubscribeMessage('music:skip')
  skipTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const room = this.controllableRoom(client);
    if (
      room &&
      typeof body?.trackId === 'string' &&
      this.music.skip(room.id, body.trackId)
    ) {
      this.broadcastMusic(room);
    }
  }

  @SubscribeMessage('music:remove')
  removeTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const room = this.controllableRoom(client);
    if (
      room &&
      typeof body?.trackId === 'string' &&
      this.music.remove(room.id, body.trackId)
    ) {
      this.broadcastMusic(room);
    }
  }

  private allow(client: Socket, action: keyof typeof LIMITS): boolean {
    return this.rateLimit.allow(client.id, action, LIMITS[action]);
  }

  private controllableRoom(client: Socket): Room | null {
    return this.allow(client, 'musicControl')
      ? this.matchmaking.activeRoomOf(client.id)
      : null;
  }

  private broadcastMusic(room: Room) {
    if (!room.guest) return;
    this.server
      .to([room.owner.socketId, room.guest.socketId])
      .emit('music:state', {
        roomId: room.id,
        ...this.music.snapshot(room.id),
      });
  }
}
