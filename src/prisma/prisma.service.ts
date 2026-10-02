import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  get enabled(): boolean {
    return this.connected;
  }

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL is not set, running without a database');
      return;
    }
    try {
      await this.$connect();
      this.connected = true;
    } catch {
      this.logger.error(
        'Could not connect to the database, running without it',
      );
    }
  }
}
