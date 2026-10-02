import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FacultyId } from '../common/constants/faculties';

export interface Participant {
  socketId: string;
  nickname: string;
  faculty: FacultyId;
  userHash: string | null;
  avoid: Set<string>;
}

export interface Room {
  id: string;
  owner: Participant;
  ownerPrefers: FacultyId | null;
  guest: Participant | null;
  createdAt: number;
  matchedAt: number | null;
}

export interface FindResult {
  room: Room;
  matched: boolean;
  preferenceMet: boolean;
}

@Injectable()
export class MatchmakingService {
  private readonly rooms = new Map<string, Room>();
  private readonly roomBySocket = new Map<string, string>();

  findOrCreate(user: Participant, prefers: FacultyId | null): FindResult {
    this.leave(user.socketId);

    const room = this.pickOpenRoom(user, prefers, prefers !== null);
    if (room) return this.join(room, user, prefers);

    const created: Room = {
      id: randomUUID(),
      owner: user,
      ownerPrefers: prefers,
      guest: null,
      createdAt: Date.now(),
      matchedAt: null,
    };
    this.rooms.set(created.id, created);
    this.roomBySocket.set(user.socketId, created.id);
    return { room: created, matched: false, preferenceMet: false };
  }

  fallback(socketId: string, roomId: string): FindResult | null {
    const own = this.rooms.get(roomId);
    if (!own || own.guest || own.owner.socketId !== socketId) return null;

    const target = this.pickOpenRoom(own.owner, own.ownerPrefers, false, own);
    if (!target) return null;

    this.rooms.delete(own.id);
    return this.join(target, own.owner, own.ownerPrefers);
  }

  leave(socketId: string): { room: Room; partner: Participant | null } | null {
    const room = this.roomOf(socketId);
    if (!room) return null;

    this.rooms.delete(room.id);
    this.roomBySocket.delete(room.owner.socketId);
    if (room.guest) this.roomBySocket.delete(room.guest.socketId);

    return { room, partner: this.partnerOf(room, socketId) };
  }

  roomOf(socketId: string): Room | null {
    const roomId = this.roomBySocket.get(socketId);
    return (roomId && this.rooms.get(roomId)) || null;
  }

  activeRoomOf(socketId: string): Room | null {
    const room = this.roomOf(socketId);
    return room?.guest ? room : null;
  }

  activePartnerOf(socketId: string): Participant | null {
    const room = this.activeRoomOf(socketId);
    return room ? this.partnerOf(room, socketId) : null;
  }

  partnerOf(room: Room, socketId: string): Participant | null {
    return room.owner.socketId === socketId ? room.guest : room.owner;
  }

  roomCounts(): { waiting: number; active: number } {
    const waiting = this.waitingCount();
    return { waiting, active: this.rooms.size - waiting };
  }

  waitingCount(): number {
    let count = 0;
    for (const room of this.rooms.values()) if (!room.guest) count++;
    return count;
  }

  private join(
    room: Room,
    user: Participant,
    prefers: FacultyId | null,
  ): FindResult {
    room.guest = user;
    room.matchedAt = Date.now();
    this.roomBySocket.set(user.socketId, room.id);
    return {
      room,
      matched: true,
      preferenceMet: prefers !== null && room.owner.faculty === prefers,
    };
  }

  private pickOpenRoom(
    user: Participant,
    prefers: FacultyId | null,
    preferredOnly: boolean,
    exclude?: Room,
  ) {
    let best: Room | null = null;
    let bestScore = -1;
    for (const room of this.rooms.values()) {
      if (room.guest || room === exclude) continue;
      if (!canPair(room.owner, user)) continue;
      const ownerIsPreferred =
        prefers !== null && room.owner.faculty === prefers;
      if (preferredOnly && !ownerIsPreferred) continue;
      const score =
        (ownerIsPreferred ? 2 : 0) +
        (room.ownerPrefers === user.faculty ? 1 : 0);
      if (score > bestScore) {
        best = room;
        bestScore = score;
      }
    }
    return best;
  }
}

function canPair(a: Participant, b: Participant): boolean {
  if (a.userHash !== null && a.userHash === b.userHash) return false;
  return !(
    (b.userHash !== null && a.avoid.has(b.userHash)) ||
    (a.userHash !== null && b.avoid.has(a.userHash))
  );
}
