import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Identity } from '../auth/auth.service';
import {
  RateLimit,
  RateLimitService,
} from '../common/rate-limit/rate-limit.service';
import { fail } from '../common/utils/ack';
import { GATEWAY_OPTIONS } from '../config/gateway';
import { PushService, readSubscription } from './push.service';

const LIMIT: RateLimit = { max: 6, windowMs: 60_000 };

function identityOf(client: Socket): Identity | null {
  return (client.data as { identity?: Identity | null })?.identity ?? null;
}

@WebSocketGateway(GATEWAY_OPTIONS)
export class PushGateway {
  constructor(
    private readonly push: PushService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @SubscribeMessage('presence:visibility')
  visibility(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    this.push.setAway(client.id, body?.hidden === true);
  }

  @SubscribeMessage('push:subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const identity = identityOf(client);
    if (!identity || !this.push.enabled) return fail('unavailable');
    if (!this.rateLimit.allow(client.id, 'push', LIMIT)) {
      return fail('rate_limited');
    }
    const subscription = readSubscription(body?.subscription);
    if (!subscription) return fail('invalid_subscription');
    if (!(await this.push.subscribe(identity.userHash, subscription))) {
      return fail('unavailable');
    }
    this.push.attach(client.id, subscription.endpoint);
    return { ok: true };
  }

  @SubscribeMessage('push:unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: Record<string, unknown> | undefined,
  ) {
    const identity = identityOf(client);
    const endpoint = body?.endpoint;
    if (!identity || typeof endpoint !== 'string') return fail('invalid');
    await this.push.unsubscribe(identity.userHash, endpoint);
    this.push.attach(client.id, null);
    return { ok: true };
  }
}
