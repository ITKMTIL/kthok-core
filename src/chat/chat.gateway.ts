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
import { AuthService } from '../auth/auth.service';
import { Student } from '../auth/utils/student';
import { isFacultyId } from '../common/constants/faculties';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { hasBannedWords, maskBannedWords } from '../common/utils/word-filter';
import { ALLOWED_ORIGINS } from '../config/origins';
import {
  MatchmakingService,
  Participant,
  Room,
} from '../matchmaking/matchmaking.service';
import { MusicService } from '../music/music.service';
import { ReactionsService } from '../reactions/reactions.service';

const MAX_NICKNAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;
const PREFERENCE_GRACE_MS = Number(process.env.PREFERENCE_GRACE_MS ?? 8000);

const LIMITS = {
  find: { max: 4, windowMs: 10_000 },
  message: { max: 5, windowMs: 3_000 },
  typing: { max: 10, windowMs: 5_000 },
} satisfies Record<string, RateLimit>;

@WebSocketGateway({ cors: { origin: ALLOWED_ORIGINS } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly music: MusicService,
    private readonly reactions: ReactionsService,
    private readonly rateLimit: RateLimitService,
    private readonly auth: AuthService,
  ) {}

  handleConnection(client: Socket) {
    const student = this.auth.verifySession(client.handshake.auth?.token);
    if (this.auth.required && !student) {
      client.emit('auth:error');
      client.disconnect(true);
      return;
    }
    client.data = { student };
    if (student) client.emit('auth:ok', { faculty: student.faculty });
    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    this.closeRoomOf(client);
    this.rateLimit.forget(client.id);
    this.broadcastStats();
  }

  @SubscribeMessage('match:find')
  find(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    if (!this.allow(client, 'find')) return fail('rate_limited');

    const nickname =
      typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    if (!nickname || nickname.length > MAX_NICKNAME_LENGTH) {
      return fail('invalid_nickname');
    }
    if (hasBannedWords(nickname)) return fail('nickname_not_allowed');
    const student = (client.data as { student?: Student | null }).student;
    const faculty = this.auth.required ? student?.faculty : body?.faculty;
    if (!isFacultyId(faculty)) return fail('invalid_faculty');
    const prefers = body?.preferFaculty ?? null;
    if (prefers !== null && !isFacultyId(prefers)) {
      return fail('invalid_prefer_faculty');
    }

    this.closeRoomOf(client);

    const user: Participant = {
      socketId: client.id,
      nickname,
      faculty,
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
    const raw = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!raw || raw.length > MAX_MESSAGE_LENGTH) return fail('invalid_text');

    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    if (!room || !partner) return fail('not_in_chat');
    if (!this.allow(client, 'message')) return fail('rate_limited');

    const message = {
      id: randomUUID(),
      text: maskBannedWords(raw),
      at: Date.now(),
    };
    this.reactions.track(room.id, message.id);
    this.server.to(partner.socketId).emit('chat:message', message);
    return { ok: true, message };
  }

  @SubscribeMessage('chat:typing')
  typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const partner = this.matchmaking.activePartnerOf(client.id);
    if (!partner || !this.allow(client, 'typing')) return;
    this.server
      .to(partner.socketId)
      .emit('chat:typing', { typing: body?.typing === true });
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

  private allow(client: Socket, action: keyof typeof LIMITS): boolean {
    return this.rateLimit.allow(client.id, action, LIMITS[action]);
  }

  private closeRoomOf(client: Socket) {
    const left = this.matchmaking.leave(client.id);
    if (left) {
      this.music.clear(left.room.id);
      this.reactions.clear(left.room.id);
    }
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
