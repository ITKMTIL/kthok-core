export const FACULTY_IDS = [
  'engineering',
  'architecture',
  'industrial-education',
  'agricultural-technology',
  'science',
  'food-industry',
  'information-technology',
  'business',
  'liberal-arts',
  'medicine',
  'dentistry',
  'international-college',
  'materials-innovation',
  'advanced-manufacturing',
  'aviation',
  'music-engineering',
] as const;

export type FacultyId = (typeof FACULTY_IDS)[number];

export function isFacultyId(value: unknown): value is FacultyId {
  return (
    typeof value === 'string' &&
    (FACULTY_IDS as readonly string[]).includes(value)
  );
}
