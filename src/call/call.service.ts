import { Injectable } from '@nestjs/common';

export type CallStatus = 'ringing' | 'active';

export interface Call {
  status: CallStatus;
  callerSocketId: string;
}

export const MIN_MESSAGES_BEFORE_CALL = Number(
  process.env.CALL_MIN_MESSAGES ?? 5,
);

@Injectable()
export class CallService {
  private readonly calls = new Map<string, Call>();
  private readonly messageCounts = new Map<string, number>();

  noteMessage(roomId: string) {
    this.messageCounts.set(roomId, (this.messageCounts.get(roomId) ?? 0) + 1);
  }

  canCall(roomId: string): boolean {
    return (this.messageCounts.get(roomId) ?? 0) >= MIN_MESSAGES_BEFORE_CALL;
  }

  get(roomId: string): Call | null {
    return this.calls.get(roomId) ?? null;
  }

  ring(roomId: string, callerSocketId: string): Call | null {
    if (this.calls.has(roomId)) return null;
    const call: Call = { status: 'ringing', callerSocketId };
    this.calls.set(roomId, call);
    return call;
  }

  accept(roomId: string, socketId: string): boolean {
    const call = this.calls.get(roomId);
    if (call?.status !== 'ringing' || call.callerSocketId === socketId) {
      return false;
    }
    call.status = 'active';
    return true;
  }

  end(roomId: string): Call | null {
    const call = this.calls.get(roomId) ?? null;
    this.calls.delete(roomId);
    return call;
  }

  clear(roomId: string) {
    this.calls.delete(roomId);
    this.messageCounts.delete(roomId);
  }
}
