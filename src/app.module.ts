import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { PrismaModule } from './prisma/prisma.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [PrismaModule, StatsModule, ChatModule, AdminModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
