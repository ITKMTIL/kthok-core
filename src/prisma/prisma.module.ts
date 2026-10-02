import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Makes PrismaService available everywhere in the app
@Module({
  providers: [PrismaService], // Tell NestJS to create and manage PrismaService
  exports: [PrismaService],   // Allow other modules to inject and use PrismaService
})
export class PrismaModule {}
