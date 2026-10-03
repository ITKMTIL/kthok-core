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
import { hasBannedWords } from '../common/utils/word-filter';
import { GATEWAY_OPTIONS } from '../config/gateway';
import { PushService } from '../push/push.service';
import { isReportReason, ReportsService } from '../reports/reports.service';
import { StatsService } from '../stats/stats.service';
import { FollowupService } from './followup.service';

const MAX_CONTACT_LENGTH = 60;
const MAX_NOTE_LENGTH = 300;
const MAX_EVIDENCE = 20;
const MAX_TEXT_LENGTH = 1000;

const LIMITS = {
  keep: { max: 5, windowMs: 60_000 },
  report: { max: 3, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimit>;

@WebSocketGateway(GATEWAY_OPTIONS)
export class FollowupGateway {
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly followup: FollowupService,
    private readonly reports: ReportsService,
    private readonly rateLimit: RateLimitService,
    private readonly stats: StatsService,
    private readonly push: PushService,
  ) {}

  @SubscribeMessage('room:keep')
  keep(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const record = this.followup.get(client.id);
    if (!record || record.endedAt === null) return fail('not_ended');
    if (!this.rateLimit.allow(client.id, 'room:keep', LIMITS.keep)) {
      return fail('rate_limited');
    }
    const contact =
      typeof body?.contact === 'string' ? body.contact.trim() : '';
    if (!contact || contact.length > MAX_CONTACT_LENGTH) {
      return fail('invalid_contact');
    }
    if (hasBannedWords(contact)) return fail('contact_not_allowed');

    const first = record.contact === null;
    record.contact = contact;
    const partner = this.followup.partnerRecord(record);
    if (partner?.contact) {
      this.server
        .to(partner.socketId)
        .emit('room:contact', { roomId: partner.roomId, contact });
      this.server.to(record.socketId).emit('room:contact', {
        roomId: record.roomId,
        contact: partner.contact,
      });
      if (first) this.stats.count('keep_mutual');
      return { ok: true, mutual: true };
    }
    if (first) {
      this.stats.count('keep_offer');
      this.server
        .to(record.partnerSocketId)
        .emit('room:keep-offered', { roomId: record.roomId });
      this.push.nudge(record.partnerSocketId, 'keep');
    }
    return { ok: true, mutual: false };
  }

  @SubscribeMessage('room:report')
  async report(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const record = this.followup.get(client.id);
    if (!record) return fail('no_room');
    if (!this.reports.enabled || !record.selfHash || !record.partnerHash) {
      return fail('unavailable');
    }
    if (record.reported) return fail('already_reported');
    if (!isReportReason(body?.reason)) return fail('invalid_reason');
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    if (note.length > MAX_NOTE_LENGTH) return fail('invalid_note');
    const messages = readMessages(body?.messages);
    if (!messages) return fail('invalid_messages');
    const evidence = this.followup.verify(record, messages);
    if (!evidence) return fail('invalid_messages');
    if (!this.rateLimit.allow(client.id, 'room:report', LIMITS.report)) {
      return fail('rate_limited');
    }

    record.reported = true;
    const saved = await this.reports.create({
      reporterHash: record.selfHash,
      reportedHash: record.partnerHash,
      reason: body.reason,
      note,
      messages: evidence,
    });
    if (!saved) {
      record.reported = false;
      return fail('unavailable');
    }
    this.stats.count('report');
    return { ok: true };
  }
}

function readMessages(value: unknown): { id: string; text: string }[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE) return null;
  const messages: { id: string; text: string }[] = [];
  for (const item of value) {
    const { id, text } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof text !== 'string') return null;
    if (text.length > MAX_TEXT_LENGTH) return null;
    messages.push({ id, text });
  }
  return messages;
}
