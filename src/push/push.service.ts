import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type PushKind = 'match' | 'message' | 'call' | 'keep';

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const THROTTLE_MS = 30_000;
const TTL_SECONDS = 120;
const MAX_ENDPOINT_LENGTH = 1000;
const MAX_KEY_LENGTH = 200;

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

interface Presence {
  hash: string;
  away: boolean;
}

export function readSubscription(value: unknown): PushSubscriptionInput | null {
  const { endpoint, keys } = (value ?? {}) as Record<string, unknown>;
  const { p256dh, auth } = (keys ?? {}) as Record<string, unknown>;
  if (
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('https://') ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    p256dh.length > MAX_KEY_LENGTH ||
    auth.length > MAX_KEY_LENGTH
  ) {
    return null;
  }
  return { endpoint, p256dh, auth };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly presence = new Map<string, Presence>();
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {
    if (this.configured) {
      webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    }
  }

  private get configured(): boolean {
    return PUBLIC_KEY !== '' && PRIVATE_KEY !== '';
  }

  get enabled(): boolean {
    return this.configured && this.prisma.enabled;
  }

  get publicKey(): string | null {
    return this.enabled ? PUBLIC_KEY : null;
  }

  track(socketId: string, hash: string) {
    this.presence.set(socketId, { hash, away: false });
  }

  setAway(socketId: string, away: boolean) {
    const entry = this.presence.get(socketId);
    if (entry) entry.away = away;
  }

  forget(socketId: string) {
    this.presence.delete(socketId);
  }

  async subscribe(
    hash: string,
    input: PushSubscriptionInput,
  ): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const user = await this.prisma.user.findUnique({ where: { hash } });
      if (!user) return false;
      await this.prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { userId: user.id, ...input },
        update: { userId: user.id, p256dh: input.p256dh, auth: input.auth },
      });
      return true;
    } catch (error) {
      this.fail('subscribe', error);
      return false;
    }
  }

  async unsubscribe(hash: string, endpoint: string): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint, user: { hash } },
      });
    } catch (error) {
      this.fail('unsubscribe', error);
    }
  }

  nudge(socketId: string, kind: PushKind, now = Date.now()) {
    const entry = this.presence.get(socketId);
    if (!this.enabled || !entry?.away) return;
    const key = `${entry.hash}:${kind}`;
    if (now - (this.lastSent.get(key) ?? 0) < THROTTLE_MS) return;
    this.lastSent.set(key, now);
    void this.send(entry.hash, kind);
  }

  private async send(hash: string, kind: PushKind) {
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { user: { hash } },
      });
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              JSON.stringify({ kind }),
              { TTL: TTL_SECONDS, urgency: 'high' },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription.delete({
                where: { id: subscription.id },
              });
            }
          }
        }),
      );
    } catch (error) {
      this.fail('send', error);
    }
  }

  private fail(action: string, error: unknown) {
    const reason = error instanceof Error ? error.name : 'unknown error';
    this.logger.error(`${action} failed: ${reason}`);
  }
}
