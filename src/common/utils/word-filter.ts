const BANNED_THAI = [
  'ควย',
  'เหี้ย',
  'เย็ด',
  'หน้าหี',
  'อีดอก',
  'แตด',
  'เงี่ยน',
  'ไอ้สัส',
  'อีสัส',
  'ไอสัส',
];

const BANNED_LATIN = [
  'fuck',
  'bitch',
  'cunt',
  'pussy',
  'nigger',
  'nigga',
  'faggot',
  'whore',
  'slut',
];

const SEPARATORS = '[\\s._\\-*~|]*';
const INVISIBLE = new RegExp('[\\u200b-\\u200d\\u2060\\ufeff]', 'g');
const MASK = '***';

function escape(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loosePattern(word: string): string {
  return Array.from(word)
    .map((char) => `${escape(char)}+`)
    .join(SEPARATORS);
}

export const DEFAULT_BANNED_WORDS: readonly string[] = [
  ...BANNED_THAI,
  ...BANNED_LATIN,
];

function patternFor(word: string): string {
  return /^[a-z]+$/.test(word)
    ? `(?<![a-z])${loosePattern(word)}(?![a-z])`
    : loosePattern(word);
}

function compile(words: readonly string[]): RegExp {
  return new RegExp(words.map(patternFor).join('|'), 'giu');
}

let BANNED = compile(DEFAULT_BANNED_WORDS);

export function setExtraBannedWords(words: readonly string[]) {
  BANNED = compile([...DEFAULT_BANNED_WORDS, ...words]);
}

export function maskBannedWords(text: string): string {
  return text.replace(INVISIBLE, '').replace(BANNED, MASK);
}

export function hasBannedWords(text: string): boolean {
  return maskBannedWords(text) !== text.replace(INVISIBLE, '');
}
