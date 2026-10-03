const SIGNATURES: { mime: string; offset: number; bytes: number[] }[] = [
  { mime: 'audio/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: 'audio/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'audio/ogg', offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
];

export function detectAudioMime(data: Buffer): string | null {
  const match = SIGNATURES.find(({ offset, bytes }) =>
    bytes.every((byte, index) => data[offset + index] === byte),
  );
  return match?.mime ?? null;
}

export function toBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function readPeaks(value: unknown, count: number): number[] | null {
  if (!Array.isArray(value) || value.length !== count) return null;
  const peaks: number[] = [];
  for (const peak of value) {
    if (typeof peak !== 'number' || !Number.isFinite(peak)) return null;
    peaks.push(Math.round(Math.min(1, Math.max(0, peak)) * 100) / 100);
  }
  return peaks;
}
