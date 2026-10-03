import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FacultyId } from '../common/constants/faculties';
import { TopicId } from '../common/constants/topics';

export interface Participant {
  socketId: string;
  key: string;
  nickname: string;
  faculty: FacultyId;
  topic: TopicId;
  userHash: string | null;
  admin: boolean;
  avoid: Set<string>;
  recent: string[];
  penaltyUntil: number;
}

export interface Room {
  id: string;
  owner: Participant;
  ownerPrefers: FacultyId | null;
  topic: TopicId;
  guest: Participant | null;
  createdAt: number;
  matchedAt: number | null;
}

export interface FindResult {
  room: Room;
  matched: boolean;
  preferenceMet: boolean;
}

export interface WaitingSummary {
  faculties: FacultyId[];
  topics: TopicId[];
}

const RECENT_PARTNERS = 3;

@Injectable()
export class MatchmakingService {
  private readonly rooms = new Map<string, Room>();
  private readonly roomBySocket = new Map<string, string>();

  findOrCreate(
    user: Participant,
    prefers: FacultyId | null,
    now = Date.now(),
  ): FindResult {
    this.leave(user.socketId);

    const room =
      user.penaltyUntil > now
        ? null
        : this.pickOpenRoom(user, prefers, {
            preferredOnly: prefers !== null,
            allowRecent: false,
            now,
          });
    if (room) return this.join(room, user, prefers, now);

    const created: Room = {
      id: randomUUID(),
      owner: user,
      ownerPrefers: prefers,
      topic: user.topic,
      guest: null,
      createdAt: now,
      matchedAt: null,
    };
    this.rooms.set(created.id, created);
    this.roomBySocket.set(user.socketId, created.id);
    return { room: created, matched: false, preferenceMet: false };
  }

  fallback(
    socketId: string,
    roomId: string,
    now = Date.now(),
  ): FindResult | null {
    const own = this.rooms.get(roomId);
    if (!own || own.guest || own.owner.socketId !== socketId) return null;
    if (own.owner.penaltyUntil > now) return null;

    const target = this.pickOpenRoom(own.owner, own.ownerPrefers, {
      preferredOnly: false,
      allowRecent: true,
      now,
      exclude: own,
    });
    if (!target) return null;

    this.rooms.delete(own.id);
    return this.join(target, own.owner, own.ownerPrefers, now);
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

  waitingSummary(): WaitingSummary {
    const faculties = new Set<FacultyId>();
    const topics = new Set<TopicId>();
    for (const room of this.rooms.values()) {
      if (room.guest) continue;
      faculties.add(room.owner.faculty);
      topics.add(room.topic);
    }
    return { faculties: [...faculties], topics: [...topics] };
  }

  private join(
    room: Room,
    user: Participant,
    prefers: FacultyId | null,
    now: number,
  ): FindResult {
    room.guest = user;
    room.matchedAt = now;
    this.roomBySocket.set(user.socketId, room.id);
    remember(room.owner, user.key);
    remember(user, room.owner.key);
    return {
      room,
      matched: true,
      preferenceMet: prefers !== null && room.owner.faculty === prefers,
    };
  }

  private pickOpenRoom(
    user: Participant,
    prefers: FacultyId | null,
    options: {
      preferredOnly: boolean;
      allowRecent: boolean;
      now: number;
      exclude?: Room;
    },
  ) {
    let best: Room | null = null;
    let bestScore = -1;
    for (const room of this.rooms.values()) {
      if (room.guest || room === options.exclude) continue;
      if (room.topic !== user.topic) continue;
      if (room.owner.penaltyUntil > options.now) continue;
      if (!canPair(room.owner, user)) continue;
      if (!options.allowRecent && isRecent(room.owner, user)) continue;
      const ownerIsPreferred =
        prefers !== null && room.owner.faculty === prefers;
      if (options.preferredOnly && !ownerIsPreferred) continue;
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

function remember(participant: Participant, key: string) {
  const recent = participant.recent.filter((existing) => existing !== key);
  recent.unshift(key);
  participant.recent.splice(
    0,
    participant.recent.length,
    ...recent.slice(0, RECENT_PARTNERS),
  );
}

function isRecent(a: Participant, b: Participant): boolean {
  if (a.admin && a.key === b.key) return false;
  return a.recent.includes(b.key) || b.recent.includes(a.key);
}

function canPair(a: Participant, b: Participant): boolean {
  if (a.userHash !== null && a.userHash === b.userHash) return a.admin;
  return !(
    (b.userHash !== null && a.avoid.has(b.userHash)) ||
    (a.userHash !== null && b.avoid.has(a.userHash))
  );
}
