import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { openSession, sealSession } from '../auth/utils/session-cipher';
import { Evidence } from '../followup/followup.service';
import { PrismaService } from '../prisma/prisma.service';

export const REPORT_REASONS = [
  'harassment',
  'sexual',
  'hate',
  'spam',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const RETENTION_MS = 30 * 86_400_000;
const PURGE_INTERVAL_MS = 60 * 60_000;
const BAN_FOREVER = new Date('9999-12-31T00:00:00Z');

export function isReportReason(value: unknown): value is ReportReason {
  return REPORT_REASONS.includes(value as ReportReason);
}

interface SealedEvidence {
  note: string;
  messages: Evidence[];
}

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private readonly secret = `evidence:${process.env.SESSION_SECRET ?? ''}`;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return this.prisma.enabled;
  }

  onModuleInit() {
    if (!this.enabled) return;
    void this.purge();
    this.timer = setInterval(() => void this.purge(), PURGE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(input: {
    reporterHash: string;
    reportedHash: string;
    reason: ReportReason;
    note: string;
    messages: Evidence[];
  }): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const [reporter, reported] = await Promise.all([
        this.prisma.user.findUnique({ where: { hash: input.reporterHash } }),
        this.prisma.user.findUnique({ where: { hash: input.reportedHash } }),
      ]);
      if (!reporter || !reported) return false;
      const evidence: SealedEvidence = {
        note: input.note,
        messages: input.messages,
      };
      await this.prisma.report.create({
        data: {
          reporterId: reporter.id,
          reportedId: reported.id,
          reason: input.reason,
          evidence: sealSession(evidence, this.secret),
          expiresAt: new Date(Date.now() + RETENTION_MS),
        },
      });
      return true;
    } catch (error) {
      this.fail('create', error);
      return false;
    }
  }

  async countAgainst(hash: string, since: Date): Promise<number> {
    if (!this.enabled) return 0;
    try {
      return await this.prisma.report.count({
        where: {
          reported: { hash },
          createdAt: { gte: since },
          status: { not: 'dismissed' },
        },
      });
    } catch (error) {
      this.fail('countAgainst', error);
      return 0;
    }
  }

  async list(status: 'open' | 'closed', now = new Date()) {
    const reports = await this.prisma.report.findMany({
      where: {
        status: status === 'open' ? 'open' : { not: 'open' },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: status === 'open' ? 'asc' : 'desc' },
      take: 100,
      include: {
        reported: { select: { id: true, faculty: true, bannedUntil: true } },
      },
    });
    const monthAgo = new Date(now.getTime() - RETENTION_MS);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const reportedIds = [
      ...new Set(reports.map((report) => report.reportedId)),
    ];
    const [reportCounts, blockCounts] = await Promise.all([
      this.prisma.report.groupBy({
        by: ['reportedId'],
        where: {
          reportedId: { in: reportedIds },
          createdAt: { gte: monthAgo },
        },
        _count: { _all: true },
      }),
      this.prisma.block.groupBy({
        by: ['blockedId'],
        where: { blockedId: { in: reportedIds }, createdAt: { gte: weekAgo } },
        _count: { _all: true },
      }),
    ]);
    const reportsOf = new Map(
      reportCounts.map((row) => [row.reportedId, row._count._all]),
    );
    const blocksOf = new Map(
      blockCounts.map((row) => [row.blockedId, row._count._all]),
    );

    return reports.map((report) => {
      const evidence = openSession(
        report.evidence,
        this.secret,
      ) as SealedEvidence | null;
      return {
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.getTime(),
        expiresAt: report.expiresAt.getTime(),
        resolvedAt: report.resolvedAt?.getTime() ?? null,
        note: evidence?.note ?? '',
        messages: evidence?.messages ?? [],
        evidenceReadable: evidence !== null,
        reported: {
          ref: report.reported.id,
          faculty: report.reported.faculty,
          bannedUntil: report.reported.bannedUntil?.getTime() ?? null,
          reports30d: reportsOf.get(report.reportedId) ?? 0,
          blocks7d: blocksOf.get(report.reportedId) ?? 0,
        },
      };
    });
  }

  async resolve(
    id: number,
    action: 'dismiss' | 'ban',
    ban: { days: number | null; reason: string } | null,
  ): Promise<{ bannedHash: string | null } | null> {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { reported: { select: { id: true, hash: true } } },
    });
    if (!report) return null;
    const now = new Date();
    await this.prisma.report.update({
      where: { id },
      data: {
        status: action === 'ban' ? 'actioned' : 'dismissed',
        resolvedAt: now,
      },
    });
    if (action !== 'ban' || !ban) return { bannedHash: null };
    const until =
      ban.days === null
        ? BAN_FOREVER
        : new Date(now.getTime() + ban.days * 86_400_000);
    await this.prisma.user.update({
      where: { id: report.reported.id },
      data: { bannedUntil: until, banReason: ban.reason },
    });
    return { bannedHash: report.reported.hash };
  }

  async unban(userId: number): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { bannedUntil: null, banReason: null },
      });
      return true;
    } catch {
      return false;
    }
  }

  private async purge(now = new Date()) {
    try {
      const { count } = await this.prisma.report.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      if (count > 0) this.logger.log(`purged ${count} expired reports`);
    } catch (error) {
      this.fail('purge', error);
    }
  }

  private fail(action: string, error: unknown) {
    const reason = error instanceof Error ? error.name : 'unknown error';
    this.logger.error(`${action} failed: ${reason}`);
  }
}
