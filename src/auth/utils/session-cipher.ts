import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function sealSession(payload: object, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyFrom(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url',
  );
}

export function openSession(token: string, secret: string): unknown {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= IV_LENGTH + TAG_LENGTH) return null;
    const decipher = createDecipheriv(
      ALGORITHM,
      keyFrom(secret),
      raw.subarray(0, IV_LENGTH),
    );
    decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    const decrypted = Buffer.concat([
      decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}
