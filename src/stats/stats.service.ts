import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type Metric =
  | 'login'
  | 'match'
  | 'preference_requested'
  | 'preference_met'
  | 'message'
  | 'call'
  | 'room'
  | 'room_seconds'
  | 'block'
  | 'feedback_up'
  | 'feedback_down'
  | 'peak_online';

const FLUSH_INTERVAL_MS = Number(process.env.STATS_FLUSH_MS ?? 30_000);
const TZ_OFFSET_MINUTES = Number(process.env.STATS_TZ_OFFSET_MINUTES ?? 420);
const SEPARATOR = '|';

function localDay(now: number): Date {
  const shifted = new Date(now + TZ_OFFSET_MINUTES * 60_000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ),
  );
}

@Injectable()
export class StatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  private readonly sums = new Map<string, number>();
  private readonly peaks = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  count(metric: Metric, faculty = '', by = 1) {
    if (!this.prisma.enabled || by <= 0) return;
    const key = this.key(metric, faculty);
    this.sums.set(key, (this.sums.get(key) ?? 0) + Math.round(by));
  }

  peak(metric: Metric, value: number) {
    if (!this.prisma.enabled) return;
    const key = this.key(metric, '');
    this.peaks.set(key, Math.max(this.peaks.get(key) ?? 0, value));
  }

  async flush() {
    if (!this.prisma.enabled) return;
    const sums = [...this.sums];
    const peaks = [...this.peaks];
    this.sums.clear();
    this.peaks.clear();
    try {
      for (const [key, value] of sums) {
        const { day, metric, faculty } = this.parse(key);
        await this.prisma.dailyStat.upsert({
          where: { day_metric_faculty: { day, metric, faculty } },
          create: { day, metric, faculty, count: value },
          update: { count: { increment: value } },
        });
      }
      for (const [key, value] of peaks) {
        const { day, metric, faculty } = this.parse(key);
        await this.prisma.$executeRaw`
          INSERT INTO daily_stats (day, metric, faculty, count)
          VALUES (${day}::date, ${metric}, ${faculty}, ${value})
          ON CONFLICT (day, metric, faculty)
          DO UPDATE SET count = GREATEST(daily_stats.count, EXCLUDED.count)`;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.error(`flush failed: ${reason}`);
    }
  }

  today(): string {
    return localDay(Date.now()).toISOString().slice(0, 10);
  }

  async summary(days: number) {
    const since = localDay(Date.now() - (days - 1) * 86_400_000);
    const rows = await this.prisma.dailyStat.findMany({
      where: { day: { gte: since } },
      orderBy: [{ day: 'asc' }, { metric: 'asc' }, { faculty: 'asc' }],
    });
    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      metric: row.metric,
      faculty: row.faculty || null,
      count: row.count,
    }));
  }

  private key(metric: Metric, faculty: string): string {
    return [localDay(Date.now()).getTime(), metric, faculty].join(SEPARATOR);
  }

  private parse(key: string) {
    const [day, metric, faculty] = key.split(SEPARATOR);
    return { day: new Date(Number(day)), metric, faculty };
  }
}
