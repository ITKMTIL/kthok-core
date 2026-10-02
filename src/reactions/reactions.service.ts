import { Injectable } from '@nestjs/common';
import { Reaction } from '../common/constants/reactions';

export const MAX_TRACKED_MESSAGES = 200;

type MessageReactions = Map<string, Reaction>;

@Injectable()
export class ReactionsService {
  private readonly rooms = new Map<string, Map<string, MessageReactions>>();

  track(roomId: string, messageId: string) {
    let messages = this.rooms.get(roomId);
    if (!messages) {
      messages = new Map();
      this.rooms.set(roomId, messages);
    }
    messages.set(messageId, new Map());
    if (messages.size > MAX_TRACKED_MESSAGES) {
      const [oldest] = messages.keys();
      messages.delete(oldest);
    }
  }

  react(
    roomId: string,
    messageId: string,
    socketId: string,
    reaction: Reaction | null,
  ): MessageReactions | null {
    const reactions = this.rooms.get(roomId)?.get(messageId);
    if (!reactions) return null;
    if (reaction === null) reactions.delete(socketId);
    else reactions.set(socketId, reaction);
    return reactions;
  }

  clear(roomId: string) {
    this.rooms.delete(roomId);
  }
}
