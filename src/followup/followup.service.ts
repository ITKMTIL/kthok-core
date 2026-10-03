import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { Room } from '../matchmaking/matchmaking.service';

export const FOLLOWUP_MS = Number(process.env.FOLLOWUP_MS ?? 10 * 60_000);
const MAX_DIGESTS = 300;

interface Trail {
  digests: Map<string, { digest: string; sender: string }>;
}

export interface Followup {
  roomId: string;
  socketId: string;
  partnerSocketId: string;
  selfHash: string | null;
  partnerHash: string | null;
  trail: Trail;
  endedAt: number | null;
  reported: boolean;
  contact: string | null;
}

export interface Evidence {
  fromReported: boolean;
  text: string;
}

@Injectable()
export class FollowupService implements OnModuleDestroy {
  private readonly key = randomBytes(32);
  private readonly records = new Map<string, Followup>();
  private readonly timer = setInterval(() => this.sweep(), 60_000);

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  open(room: Room) {
    if (!room.guest) return;
    const trail: Trail = { digests: new Map() };
    const [a, b] = [room.owner, room.guest];
    for (const [self, other] of [
      [a, b],
      [b, a],
    ]) {
      this.records.set(self.socketId, {
        roomId: room.id,
        socketId: self.socketId,
        partnerSocketId: other.socketId,
        selfHash: self.userHash,
        partnerHash: other.userHash,
        trail,
        endedAt: null,
        reported: false,
        contact: null,
      });
    }
  }

  note(socketId: string, messageId: string, text: string) {
    const record = this.records.get(socketId);
    if (!record || record.endedAt !== null) return;
    const { digests } = record.trail;
    digests.set(messageId, { digest: this.digest(text), sender: socketId });
    if (digests.size > MAX_DIGESTS) {
      const [oldest] = digests.keys();
      digests.delete(oldest);
    }
  }

  end(roomId: string, now = Date.now()) {
    for (const record of this.records.values()) {
      if (record.roomId === roomId && record.endedAt === null) {
        record.endedAt = now;
      }
    }
  }

  get(socketId: string, now = Date.now()): Followup | null {
    const record = this.records.get(socketId);
    if (!record) return null;
    if (record.endedAt !== null && now - record.endedAt > FOLLOWUP_MS) {
      this.records.delete(socketId);
      return null;
    }
    return record;
  }

  partnerRecord(record: Followup): Followup | null {
    const other = this.get(record.partnerSocketId);
    return other?.roomId === record.roomId ? other : null;
  }

  verify(
    record: Followup,
    messages: { id: string; text: string }[],
  ): Evidence[] | null {
    const evidence: Evidence[] = [];
    for (const message of messages) {
      const entry = record.trail.digests.get(message.id);
      if (!entry || entry.digest !== this.digest(message.text)) return null;
      evidence.push({
        fromReported: entry.sender === record.partnerSocketId,
        text: message.text,
      });
    }
    return evidence;
  }

  private digest(text: string): string {
    return createHmac('sha256', this.key).update(text).digest('base64url');
  }

  private sweep(now = Date.now()) {
    for (const [socketId, record] of this.records) {
      if (record.endedAt !== null && now - record.endedAt > FOLLOWUP_MS) {
        this.records.delete(socketId);
      }
    }
  }
}
