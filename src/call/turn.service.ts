import { Injectable, Logger } from '@nestjs/common';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  relayOnly: boolean;
}

const STUN_ONLY: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const BROWSER_BLOCKED_PORT = /:53(\?|$)/;
const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class TurnService {
  private readonly logger = new Logger(TurnService.name);
  private readonly keyId = process.env.TURN_KEY_ID || null;
  private readonly apiToken = process.env.TURN_KEY_API_TOKEN || null;
  private readonly ttlSeconds = Number(
    process.env.TURN_CREDENTIAL_TTL ?? 14_400,
  );
  private readonly forceRelay = process.env.CALL_FORCE_RELAY !== 'false';

  get configured(): boolean {
    return this.keyId !== null && this.apiToken !== null;
  }

  async iceConfig(): Promise<IceConfig | null> {
    if (!this.configured) return { iceServers: STUN_ONLY, relayOnly: false };

    const iceServers = await this.generate();
    if (iceServers) return { iceServers, relayOnly: this.forceRelay };
    return this.forceRelay ? null : { iceServers: STUN_ONLY, relayOnly: false };
  }

  private async generate(): Promise<IceServer[] | null> {
    try {
      const response = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${this.keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: this.ttlSeconds }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn(`TURN credentials request failed: ${response.status}`);
        return null;
      }
      const data = (await response.json()) as { iceServers?: IceServer[] };
      if (!Array.isArray(data.iceServers)) return null;
      return data.iceServers.map((server) => ({
        ...server,
        urls: [server.urls]
          .flat()
          .filter((url) => !BROWSER_BLOCKED_PORT.test(url)),
      }));
    } catch {
      this.logger.warn('TURN credentials request failed: network error');
      return null;
    }
  }
}
