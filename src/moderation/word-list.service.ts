import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_BANNED_WORDS,
  setExtraBannedWords,
} from '../common/utils/word-filter';
import { PrismaService } from '../prisma/prisma.service';

const MIN_LENGTH = 2;
const MAX_LENGTH = 40;

export function normalizeWord(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const word = value.trim().toLowerCase().replace(/\s+/g, '');
  if (word.length < MIN_LENGTH || word.length > MAX_LENGTH) return null;
  return word;
}

@Injectable()
export class WordListService implements OnModuleInit {
  private readonly logger = new Logger(WordListService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async list() {
    const custom = await this.prisma.bannedWord.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      defaults: DEFAULT_BANNED_WORDS,
      custom: custom.map(({ id, word, createdAt }) => ({
        id,
        word,
        createdAt: createdAt.getTime(),
      })),
    };
  }

  async add(word: string): Promise<boolean> {
    if (DEFAULT_BANNED_WORDS.includes(word)) return true;
    await this.prisma.bannedWord.upsert({
      where: { word },
      create: { word },
      update: {},
    });
    await this.reload();
    return true;
  }

  async remove(id: number): Promise<boolean> {
    const { count } = await this.prisma.bannedWord.deleteMany({
      where: { id },
    });
    await this.reload();
    return count > 0;
  }

  private async reload() {
    if (!this.prisma.enabled) return;
    try {
      const words = await this.prisma.bannedWord.findMany({
        select: { word: true },
      });
      setExtraBannedWords(words.map(({ word }) => word));
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      this.logger.error(`reload failed: ${reason}`);
    }
  }
}
