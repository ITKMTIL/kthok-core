import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { StatsService } from '../stats/stats.service';
import { UsersService } from '../users/users.service';

const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;
const BAN_DAYS = [1, 7, 30] as const;
const MAX_BAN_REASON = 200;

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly stats: StatsService,
    private readonly matchmaking: MatchmakingService,
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  private authorize(authorization: string | undefined) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : null;
    const identity = this.auth.verifySession(token);
    if (!identity) throw new UnauthorizedException('invalid_session');
    if (!this.users.isAdmin(identity.userHash)) {
      throw new ForbiddenException('not_admin');
    }
    if (!this.prisma.enabled) {
      throw new ServiceUnavailableException('database_disabled');
    }
  }

  @Get('reports')
  async listReports(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
  ) {
    this.authorize(authorization);
    return {
      reports: await this.reports.list(status === 'closed' ? 'closed' : 'open'),
    };
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  async resolveReport(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown> | undefined,
  ) {
    this.authorize(authorization);
    const action = body?.action;
    if (action !== 'dismiss' && action !== 'ban') {
      throw new BadRequestException('invalid_action');
    }
    let ban: { days: number | null; reason: string } | null = null;
    if (action === 'ban') {
      const days = body?.days ?? null;
      if (
        days !== null &&
        !BAN_DAYS.includes(days as (typeof BAN_DAYS)[number])
      ) {
        throw new BadRequestException('invalid_days');
      }
      const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
      if (reason.length > MAX_BAN_REASON) {
        throw new BadRequestException('invalid_reason');
      }
      ban = { days: days as number | null, reason };
    }
    const result = await this.reports.resolve(id, action, ban);
    if (!result) throw new NotFoundException('report_not_found');
    if (result.bannedHash) this.users.notifyBan(result.bannedHash);
    return { ok: true };
  }

  @Post('users/:id/unban')
  @HttpCode(200)
  async unban(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.authorize(authorization);
    if (!(await this.reports.unban(id))) {
      throw new NotFoundException('user_not_found');
    }
    return { ok: true };
  }

  @Get('overview')
  async overview(
    @Headers('authorization') authorization: string | undefined,
    @Query('days') days: string | undefined,
  ) {
    this.authorize(authorization);

    const range = Math.min(
      MAX_DAYS,
      Math.max(1, Math.round(Number(days)) || DEFAULT_DAYS),
    );
    await this.stats.flush();
    const [totals, usersByFaculty, daily, openReports] = await Promise.all([
      this.users.totals(),
      this.users.countByFaculty(),
      this.stats.summary(range),
      this.prisma.report.count({ where: { status: 'open' } }),
    ]);

    return {
      days: range,
      today: this.stats.today(),
      generatedAt: Date.now(),
      live: this.matchmaking.roomCounts(),
      totals: { ...totals, openReports },
      usersByFaculty,
      daily,
    };
  }
}
