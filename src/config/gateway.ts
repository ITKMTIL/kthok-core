import { ALLOWED_ORIGINS } from './origins';

export const RECONNECT_GRACE_MS = Number(
  process.env.RECONNECT_GRACE_MS ?? 120_000,
);

export const GATEWAY_OPTIONS = {
  cors: { origin: ALLOWED_ORIGINS },
  connectionStateRecovery: { maxDisconnectionDuration: RECONNECT_GRACE_MS },
};
