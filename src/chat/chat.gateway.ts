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
import { AuthService, Identity } from '../auth/auth.service';
import { CallService } from '../call/call.service';
import { isFacultyId } from '../common/constants/faculties';
import { DEFAULT_TOPIC, isTopicId } from '../common/constants/topics';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { hasBannedWords, maskBannedWords } from '../common/utils/word-filter';
import { CALL_ENABLED, VOICE_ENABLED } from '../config/features';
import { GATEWAY_OPTIONS, RECONNECT_GRACE_MS } from '../config/gateway';
import {
  MatchmakingService,
  Participant,
  Room,
} from '../matchmaking/matchmaking.service';
import { MusicService } from '../music/music.service';
import { ReactionsService } from '../reactions/reactions.service';
import { StatsService } from '../stats/stats.service';
import { UsersService } from '../users/users.service';

const MAX_NICKNAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;
const PREFERENCE_GRACE_MS = Number(process.env.PREFERENCE_GRACE_MS ?? 8000);
const PENALTY_STEPS: [strikes: number, waitMs: number][] = [
  [6, 90_000],
  [3, 30_000],
];

const LIMITS = {
  find: { max: 4, windowMs: 10_000 },
  message: { max: 5, windowMs: 3_000 },
  typing: { max: 10, windowMs: 5_000 },
  block: { max: 5, windowMs: 60_000 },
} satisfies Record<string, RateLimit>;

interface ClientData {
  identity: Identity | null;
  avoid: Set<string>;
  recent: string[];
  penaltyMs: number;
}

@WebSocketGateway(GATEWAY_OPTIONS)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  private readonly pendingClose = new Map<string, NodeJS.Timeout>();
  private readonly feedbackOpen = new Set<string>();

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly music: MusicService,
    private readonly reactions: ReactionsService,
    private readonly calls: CallService,
    private readonly rateLimit: RateLimitService,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly stats: StatsService,
  ) {}

  handleConnection(client: Socket) {
    const identity = this.auth.verifySession(client.handshake.auth?.token);
    if (this.auth.required && !identity) {
      client.emit('auth:error');
      client.disconnect(true);
      return;
    }
    const data: ClientData = {
      identity,
      avoid: new Set(),
      recent: [],
      penaltyMs: 0,
    };
    client.data = data;
    if (identity) {
      client.emit('auth:ok', {
        faculty: identity.faculty,
        admin: this.users.isAdmin(identity.userHash),
      });
      void this.loadAccount(client, identity, data);
    }
    client.emit('features', {
      call: CALL_ENABLED,
      voice: VOICE_ENABLED,
      block: this.users.enabled && identity !== null,
    });
    if (this.cancelPendingClose(client.id))
      this.notifyPresence(client.id, false);
    this.broadcastStats();
  }

  handleDisconnect(client: Socket) {
    this.rateLimit.forget(client.id);
    this.feedbackOpen.delete(client.id);
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
    const { identity, avoid, recent, penaltyMs } = client.data as ClientData;
    const topic = body?.topic ?? DEFAULT_TOPIC;
    if (!isTopicId(topic)) return fail('invalid_topic');
    const faculty = this.auth.required ? identity?.faculty : body?.faculty;
    if (!isFacultyId(faculty)) return fail('invalid_faculty');
    const prefers = body?.preferFaculty ?? null;
    if (prefers !== null && !isFacultyId(prefers)) {
      return fail('invalid_prefer_faculty');
    }

    this.closeRoomOf(client.id);
    this.feedbackOpen.delete(client.id);

    const user: Participant = {
      socketId: client.id,
      key: identity?.userHash ?? client.id,
      nickname,
      faculty,
      topic,
      userHash: identity?.userHash ?? null,
      admin: identity ? this.users.isAdmin(identity.userHash) : false,
      avoid,
      recent,
      penaltyUntil: Date.now() + penaltyMs,
    };
    if (prefers !== null) this.stats.count('preference_requested', prefers);
    const { room, matched, preferenceMet } = this.matchmaking.findOrCreate(
      user,
      prefers,
    );

    if (matched) {
      this.notifyOwner(room, preferenceMet);
      this.recordMatch(room);
      if (preferenceMet && prefers) this.stats.count('preference_met', prefers);
    } else {
      setTimeout(
        () => this.fallback(client.id, room.id),
        Math.max(PREFERENCE_GRACE_MS, penaltyMs + 100),
      );
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

  @SubscribeMessage('room:block')
  async block(@ConnectedSocket() client: Socket) {
    const room = this.matchmaking.activeRoomOf(client.id);
    const partner = room && this.matchmaking.partnerOf(room, client.id);
    if (!room?.guest || !partner) return fail('not_in_chat');
    const self = room.owner.socketId === client.id ? room.owner : room.guest;
    if (!self.userHash || !partner.userHash) return fail('unavailable');
    if (self.userHash === partner.userHash) return fail('unavailable');
    if (!this.allow(client, 'block')) return fail('rate_limited');
    if (!(await this.users.block(self.userHash, partner.userHash))) {
      return fail('unavailable');
    }

    self.avoid.add(partner.userHash);
    partner.avoid.add(self.userHash);
    this.stats.count('block');
    this.closeRoomOf(client.id);
    this.feedbackOpen.delete(client.id);
    this.broadcastStats();
    return { ok: true };
  }

  @SubscribeMessage('room:feedback')
  feedback(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    if (!this.feedbackOpen.delete(client.id)) return;
    if (body?.rating === 'up') this.stats.count('feedback_up');
    else if (body?.rating === 'down') this.stats.count('feedback_down');
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
    this.stats.count('message');
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
      const room = this.matchmaking.roomOf(socketId);
      if (room?.id === roomId && room.ownerPrefers !== null) {
        this.server.to(socketId).emit('match:fallback', { roomId });
      }
      return;
    }
    const { room, preferenceMet } = result;
    this.notifyOwner(room, preferenceMet);
    this.recordMatch(room);
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

  private async loadAccount(
    client: Socket,
    identity: Identity,
    data: ClientData,
  ) {
    const user = await this.users.touch(identity.userHash, identity.faculty);
    if (this.users.isBanned(user)) {
      client.emit('auth:banned', { until: user?.bannedUntil?.getTime() });
      client.disconnect(true);
      return;
    }
    for (const hash of await this.users.avoidList(identity.userHash)) {
      data.avoid.add(hash);
    }
    const strikes = await this.users.strikes(identity.userHash);
    data.penaltyMs =
      PENALTY_STEPS.find(([threshold]) => strikes >= threshold)?.[1] ?? 0;
  }

  private recordMatch(room: Room) {
    if (!room.guest) return;
    this.stats.count('match', room.owner.faculty);
    this.stats.count('match', room.guest.faculty);
    if (room.ownerPrefers && room.ownerPrefers === room.guest.faculty) {
      this.stats.count('preference_met', room.ownerPrefers);
    }
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
      this.feedbackOpen.add(socketId).add(left.partner.socketId);
      this.stats.count('room');
      if (left.room.matchedAt) {
        this.stats.count(
          'room_seconds',
          '',
          (Date.now() - left.room.matchedAt) / 1000,
        );
      }
      this.server
        .to(left.partner.socketId)
        .emit('room:closed', { roomId: left.room.id, reason: 'partner_left' });
    }
  }

  private broadcastStats() {
    const online = this.server.of('/').sockets.size;
    this.stats.peak('peak_online', online);
    this.server.emit('stats', {
      online,
      waiting: this.matchmaking.waitingCount(),
      ...this.matchmaking.waitingSummary(),
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
