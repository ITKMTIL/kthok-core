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

const BANNED = new RegExp(
  [
    ...BANNED_THAI.map(loosePattern),
    ...BANNED_LATIN.map((word) => `(?<![a-z])${loosePattern(word)}(?![a-z])`),
  ].join('|'),
  'giu',
);

export function maskBannedWords(text: string): string {
  return text.replace(INVISIBLE, '').replace(BANNED, MASK);
}

export function hasBannedWords(text: string): boolean {
  return maskBannedWords(text) !== text.replace(INVISIBLE, '');
}
