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

const MAX_NICKNAME_LENGTH = 24;
const MAX_MESSAGE_LENGTH = 1000;
const PREFERENCE_GRACE_MS = Number(process.env.PREFERENCE_GRACE_MS ?? 8000);

type Failure = { ok: false; error: string };
const fail = (error: string): Failure => ({ ok: false, error });

const ALLOWED_ORIGINS: (string | RegExp)[] = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',')
  : ['http://localhost:3000', /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/];

@WebSocketGateway({ cors: { origin: ALLOWED_ORIGINS } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server: Server;

  constructor(private readonly matchmaking: MatchmakingService) {}

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

  private activePartner(client: Socket): Participant | null {
    const room: Room | null = this.matchmaking.roomOf(client.id);
    return room ? this.matchmaking.partnerOf(room, client.id) : null;
  }

  private closeRoomOf(client: Socket) {
    const left = this.matchmaking.leave(client.id);
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
