import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from '../stats/stats.service';
import { UsersService } from '../users/users.service';

const MAX_DAYS = 90;
const DEFAULT_DAYS = 14;

@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly stats: StatsService,
    private readonly matchmaking: MatchmakingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('overview')
  async overview(
    @Headers('authorization') authorization: string | undefined,
    @Query('days') days: string | undefined,
  ) {
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

    const range = Math.min(
      MAX_DAYS,
      Math.max(1, Math.round(Number(days)) || DEFAULT_DAYS),
    );
    await this.stats.flush();
    const [totals, usersByFaculty, daily] = await Promise.all([
      this.users.totals(),
      this.users.countByFaculty(),
      this.stats.summary(range),
    ]);

    return {
      days: range,
      today: this.stats.today(),
      generatedAt: Date.now(),
      live: this.matchmaking.roomCounts(),
      totals,
      usersByFaculty,
      daily,
    };
  }
}
