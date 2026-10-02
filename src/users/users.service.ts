import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface UserRecord {
  bannedUntil: Date | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly secret =
    process.env.USER_HASH_SECRET || process.env.SESSION_SECRET || '';

  private readonly adminHashes = new Set(
    (process.env.ADMIN_STUDENT_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => this.hashOf(id)),
  );

  constructor(private readonly prisma: PrismaService) {}

  isAdmin(hash: string): boolean {
    return this.adminHashes.has(hash);
  }

  async totals(now = new Date()) {
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const [users, activeLastDay, banned, blocks] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastSeenAt: { gte: dayAgo } } }),
      this.prisma.user.count({ where: { bannedUntil: { gt: now } } }),
      this.prisma.block.count(),
    ]);
    return { users, activeLastDay, banned, blocks };
  }

  async countByFaculty() {
    const groups = await this.prisma.user.groupBy({
      by: ['faculty'],
      _count: { _all: true },
    });
    return groups.map((group) => ({
      faculty: group.faculty,
      count: group._count._all,
    }));
  }

  get enabled(): boolean {
    return this.prisma.enabled;
  }

  hashOf(studentId: string): string {
    return createHmac('sha256', this.secret).update(studentId).digest('hex');
  }

  async touch(hash: string, faculty: string): Promise<UserRecord | null> {
    if (!this.enabled) return null;
    try {
      return await this.prisma.user.upsert({
        where: { hash },
        create: { hash, faculty },
        update: { faculty, lastSeenAt: new Date() },
        select: { bannedUntil: true },
      });
    } catch (error) {
      this.report('touch', error);
      return null;
    }
  }

  isBanned(user: UserRecord | null, now = new Date()): boolean {
    return Boolean(user?.bannedUntil && user.bannedUntil > now);
  }

  async avoidList(hash: string): Promise<string[]> {
    if (!this.enabled) return [];
    try {
      const [made, received] = await Promise.all([
        this.prisma.block.findMany({
          where: { blocker: { hash } },
          select: { blocked: { select: { hash: true } } },
        }),
        this.prisma.block.findMany({
          where: { blocked: { hash } },
          select: { blocker: { select: { hash: true } } },
        }),
      ]);
      return [
        ...made.map((block) => block.blocked.hash),
        ...received.map((block) => block.blocker.hash),
      ];
    } catch (error) {
      this.report('avoidList', error);
      return [];
    }
  }

  async block(blockerHash: string, blockedHash: string): Promise<boolean> {
    if (!this.enabled || blockerHash === blockedHash) return false;
    try {
      const [blocker, blocked] = await Promise.all([
        this.prisma.user.findUnique({ where: { hash: blockerHash } }),
        this.prisma.user.findUnique({ where: { hash: blockedHash } }),
      ]);
      if (!blocker || !blocked) return false;
      await this.prisma.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: blocker.id, blockedId: blocked.id },
        },
        create: { blockerId: blocker.id, blockedId: blocked.id },
        update: {},
      });
      return true;
    } catch (error) {
      this.report('block', error);
      return false;
    }
  }

  private report(action: string, error: unknown) {
    const reason = error instanceof Error ? error.name : 'unknown error';
    this.logger.error(`${action} failed: ${reason}`);
  }
}
