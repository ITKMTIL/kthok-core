import { Injectable } from '@nestjs/common';
import { promptsFor } from '../common/constants/prompts';
import { TopicId } from '../common/constants/topics';

@Injectable()
export class PromptsService {
  private readonly used = new Map<string, Set<number>>();

  next(roomId: string, topic: TopicId): string {
    const prompts = promptsFor(topic);
    let used = this.used.get(roomId);
    if (!used || used.size >= prompts.length) {
      used = new Set();
      this.used.set(roomId, used);
    }
    const remaining = prompts
      .map((_, index) => index)
      .filter((index) => !used.has(index));
    const index = remaining[Math.floor(Math.random() * remaining.length)];
    used.add(index);
    return prompts[index];
  }

  clear(roomId: string) {
    this.used.delete(roomId);
  }
}
