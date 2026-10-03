import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { ModerationModule } from '../moderation/moderation.module';
import { ReportsModule } from '../reports/reports.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    AuthModule,
    MatchmakingModule,
    ModerationModule,
    ReportsModule,
    UsersModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
