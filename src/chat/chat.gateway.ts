import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import { Server, Socket } from 'socket.io';
import { isFacultyId } from './faculties';
import { MatchmakingService, Participant, Room } from './matchmaking.service';
import { MusicService, parseVideoId } from './music.service';

const MAX_NICKNAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;
const PREFERENCE_GRACE_MS = Number(process.env.PREFERENCE_GRACE_MS ?? 8000);
const MAX_URL_LENGTH = 200;
const MAX_TITLE_LENGTH = 120;
const OEMBED_TIMEOUT_MS = 4000;

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

const ALLOWED_ORIGINS: (string | RegExp)[] = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',')
  : ['http://localhost:3000', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/];

@WebSocketGateway({ cors: { origin: ALLOWED_ORIGINS } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly music: MusicService,
  ) {}

  handleConnection() {
    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    this.closeRoomOf(client);
    this.broadcastStats();
  }

  @SubscribeMessage('match:find')
  find(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const nickname =
      typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    if (!nickname || nickname.length > MAX_NICKNAME_LENGTH) {
      return fail('invalid_nickname');
    }
    if (!isFacultyId(body?.faculty)) return fail('invalid_faculty');
    const prefers = body.preferFaculty ?? null;
    if (prefers !== null && !isFacultyId(prefers)) {
      return fail('invalid_prefer_faculty');
    }

    this.closeRoomOf(client);

    const user: Participant = {
      socketId: client.id,
      nickname,
      faculty: body.faculty,
    };
    const { room, matched, preferenceMet } = this.matchmaking.findOrCreate(
      user,
      prefers,
    );

    if (matched) {
      this.notifyOwner(room, preferenceMet);
    } else if (prefers !== null) {
      setTimeout(() => this.fallback(client.id, room.id), PREFERENCE_GRACE_MS);
    }
    this.broadcastStats();

    return matched
      ? matchedPayload(room, room.owner, preferenceMet)
      : { ok: true, status: 'waiting', roomId: room.id };
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: Socket) {
    this.closeRoomOf(client);
    this.broadcastStats();
    return { ok: true };
  }

  @SubscribeMessage('chat:send')
  send(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_MESSAGE_LENGTH) return fail('invalid_text');

    const partner = this.activePartner(client);
    if (!partner) return fail('not_in_chat');

    const message = { id: randomUUID(), text, at: Date.now() };
    this.server.to(partner.socketId).emit('chat:message', message);
    return { ok: true, message };
  }

  @SubscribeMessage('chat:typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const partner = this.activePartner(client);
    if (!partner) return;
    this.server
      .to(partner.socketId)
      .emit('chat:typing', { typing: body?.typing === true });
  }

  @SubscribeMessage('music:add')
  async addTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const url = typeof body?.url === 'string' ? body.url : '';
    const videoId = url.length <= MAX_URL_LENGTH ? parseVideoId(url) : null;
    if (!videoId) return fail('invalid_url');

    const before = this.activeRoom(client);
    if (!before) return fail('not_in_chat');

    const title = await fetchTitle(videoId);
    if (title === null) return fail('video_unavailable');

    const room = this.activeRoom(client);
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
    const room = this.activeRoom(client);
    if (room && this.music.play(room.id)) this.broadcastMusic(room);
  }

  @SubscribeMessage('music:pause')
  pauseMusic(@ConnectedSocket() client: Socket) {
    const room = this.activeRoom(client);
    if (room && this.music.pause(room.id)) this.broadcastMusic(room);
  }

  @SubscribeMessage('music:skip')
  skipTrack(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const room = this.activeRoom(client);
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
    const room = this.activeRoom(client);
    if (
      room &&
      typeof body?.trackId === 'string' &&
      this.music.remove(room.id, body.trackId)
    ) {
      this.broadcastMusic(room);
    }
  }

  private fallback(socketId: string, roomId: string) {
    const result = this.matchmaking.fallback(socketId, roomId);
    if (!result) {
      if (this.matchmaking.roomOf(socketId)?.id === roomId) {
        this.server.to(socketId).emit('match:fallback', { roomId });
      }
      return;
    }
    const { room, preferenceMet } = result;
    this.notifyOwner(room, preferenceMet);
    this.server
      .to(socketId)
      .emit('match:found', matchedPayload(room, room.owner, preferenceMet));
    this.broadcastStats();
  }

  private notifyOwner(room: Room, guestPreferenceMet: boolean) {
    if (!room.guest) return;
    this.server
      .to(room.owner.socketId)
      .emit(
        'match:found',
        matchedPayload(
          room,
          room.guest,
          room.ownerPrefers === room.guest.faculty,
          guestPreferenceMet,
        ),
      );
  }

  private activeRoom(client: Socket): Room | null {
    const room = this.matchmaking.roomOf(client.id);
    return room?.guest ? room : null;
  }

  private activePartner(client: Socket): Participant | null {
    const room = this.activeRoom(client);
    return room ? this.matchmaking.partnerOf(room, client.id) : null;
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

  private closeRoomOf(client: Socket) {
    const left = this.matchmaking.leave(client.id);
    if (left) this.music.clear(left.room.id);
    if (left?.partner) {
      this.server
        .to(left.partner.socketId)
        .emit('room:closed', { roomId: left.room.id, reason: 'partner_left' });
    }
  }

  private broadcastStats() {
    this.server.emit('stats', {
      online: this.server.of('/').sockets.size,
      waiting: this.matchmaking.waitingCount(),
    });
  }
}

function matchedPayload(
  room: Room,
  partner: Participant,
  preferenceMet: boolean,
  partnerPreferenceMet?: boolean,
) {
  return {
    ok: true,
    status: 'matched',
    roomId: room.id,
    partner: { nickname: partner.nickname, faculty: partner.faculty },
    preferenceMet,
    partnerPreferenceMet,
  };
}

async function fetchTitle(videoId: string): Promise<string | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const fallbackTitle = `YouTube · ${videoId}`;
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      { signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS) },
    );
    if (response.status >= 400 && response.status < 500) return null;
    if (!response.ok) return fallbackTitle;
    const data = (await response.json()) as { title?: unknown };
    return typeof data.title === 'string' && data.title
      ? data.title.slice(0, MAX_TITLE_LENGTH)
      : fallbackTitle;
  } catch {
    return fallbackTitle;
  }
}
