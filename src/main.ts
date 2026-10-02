import './config/env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ALLOWED_ORIGINS } from './config/origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: ALLOWED_ORIGINS });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
