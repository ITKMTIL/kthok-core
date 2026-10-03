import { Module } from '@nestjs/common';
import { WordListService } from './word-list.service';

@Module({
  providers: [WordListService],
  exports: [WordListService],
})
export class ModerationModule {}
