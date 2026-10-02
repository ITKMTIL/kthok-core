import { Module, Global } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';



@Module({
  imports: [ChatModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
