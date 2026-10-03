export const TOPIC_IDS = ['general', 'study', 'games', 'vent', 'food'] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export const DEFAULT_TOPIC: TopicId = 'general';

export function isTopicId(value: unknown): value is TopicId {
  return TOPIC_IDS.includes(value as TopicId);
}
