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
import { CallService } from '../call/call.service';
import { Student } from '../auth/utils/student';
import { isFacultyId } from '../common/constants/faculties';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { hasBannedWords, maskBannedWords } from '../common/utils/word-filter';
import { GATEWAY_OPTIONS, RECONNECT_GRACE_MS } from '../config/gateway';
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

@WebSocketGateway(GATEWAY_OPTIONS)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly pendingClose = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly music: MusicService,
    private readonly reactions: ReactionsService,
    private readonly calls: CallService,
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
    if (this.cancelPendingClose(client.id))
      this.notifyPresence(client.id, false);
    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    this.rateLimit.forget(client.id);
    if (this.matchmaking.roomOf(client.id)) {
      this.notifyPresence(client.id, true);
      this.pendingClose.set(
        client.id,
        setTimeout(() => {
          this.closeRoomOf(client.id);
          this.broadcastStats();
        }, RECONNECT_GRACE_MS),
      );
    }
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

    this.closeRoomOf(client.id);

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
      ? {
          ...matchedPayload(room, room.owner, preferenceMet),
          partnerAway: this.pendingClose.has(room.owner.socketId),
        }
      : { ok: true, status: 'waiting', roomId: room.id };
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: Socket) {
    this.closeRoomOf(client.id);
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
    this.calls.noteMessage(room.id);
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

  private notifyPresence(socketId: string, away: boolean) {
    const partner = this.matchmaking.activePartnerOf(socketId);
    if (partner) {
      this.server.to(partner.socketId).emit('partner:presence', { away });
    }
  }

  private cancelPendingClose(socketId: string): boolean {
    const timer = this.pendingClose.get(socketId);
    if (!timer) return false;
    clearTimeout(timer);
    this.pendingClose.delete(socketId);
    return true;
  }

  private closeRoomOf(socketId: string) {
    this.cancelPendingClose(socketId);
    const left = this.matchmaking.leave(socketId);
    if (left) {
      this.music.clear(left.room.id);
      this.reactions.clear(left.room.id);
      this.calls.clear(left.room.id);
    }
    if (left?.partner) {
      this.cancelPendingClose(left.partner.socketId);
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
