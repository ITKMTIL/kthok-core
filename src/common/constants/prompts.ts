import { TopicId } from './topics';

const PROMPT_COUNTS: Record<TopicId, number> = {
  general: 20,
  study: 5,
  games: 4,
  vent: 4,
  food: 4,
};

function keysOf(group: TopicId): string[] {
  return Array.from(
    { length: PROMPT_COUNTS[group] },
    (_, index) => `${group}.${index}`,
  );
}

export function promptsFor(topic: TopicId): readonly string[] {
  return topic === 'general'
    ? keysOf('general')
    : [...keysOf(topic), ...keysOf('general')];
}
