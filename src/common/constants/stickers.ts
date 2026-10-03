export const STICKER_IDS = [
  'hello',
  'train',
  'laugh',
  'cry',
  'love',
  'sleepy',
  'hungry',
  'study',
  'thanks',
  'bye',
] as const;

export type StickerId = (typeof STICKER_IDS)[number];

export function isStickerId(value: unknown): value is StickerId {
  return STICKER_IDS.includes(value as StickerId);
}
