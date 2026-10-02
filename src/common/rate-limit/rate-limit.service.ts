import { Injectable } from '@nestjs/common';

export interface RateLimit {
  max: number;
  windowMs: number;
}

@Injectable()
export class RateLimitService {
  private readonly hits = new Map<string, Map<string, number[]>>();

  allow(
    clientId: string,
    action: string,
    limit: RateLimit,
    now = Date.now(),
  ): boolean {
    let actions = this.hits.get(clientId);
    if (!actions) {
      actions = new Map();
      this.hits.set(clientId, actions);
    }
    const recent = (actions.get(action) ?? []).filter(
      (at) => now - at < limit.windowMs,
    );
    const allowed = recent.length < limit.max;
    if (allowed) recent.push(now);
    actions.set(action, recent);
    return allowed;
  }

  forget(clientId: string) {
    this.hits.delete(clientId);
  }
}
