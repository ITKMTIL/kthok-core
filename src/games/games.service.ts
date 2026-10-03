import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';

export const GAME_TYPES = ['xo', 'rps', 'taksa', 'tarot'] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const RPS_CHOICES = ['rock', 'paper', 'scissors'] as const;
export type RpsChoice = (typeof RPS_CHOICES)[number];

export const BIRTH_DAYS = [
  'sun',
  'mon',
  'tue',
  'wed',
  'sat',
  'thu',
  'rahu',
  'fri',
] as const;
export type BirthDay = (typeof BIRTH_DAYS)[number];

export const TAKSA_POSITIONS = [
  'boriwan',
  'ayu',
  'det',
  'sri',
  'mula',
  'utsaha',
  'montri',
  'kalakini',
] as const;
type TaksaPosition = (typeof TAKSA_POSITIONS)[number];

const TAKSA_SCORE: Record<TaksaPosition, number> = {
  boriwan: 80,
  ayu: 72,
  det: 78,
  sri: 96,
  mula: 70,
  utsaha: 68,
  montri: 90,
  kalakini: 35,
};

export const TAROT_CARDS = 22;

export function taksaPosition(self: BirthDay, other: BirthDay): TaksaPosition {
  const steps =
    (BIRTH_DAYS.indexOf(other) - BIRTH_DAYS.indexOf(self) + BIRTH_DAYS.length) %
    BIRTH_DAYS.length;
  return TAKSA_POSITIONS[steps];
}

export function isBirthDay(value: unknown): value is BirthDay {
  return BIRTH_DAYS.includes(value as BirthDay);
}

const XO_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const BEATS: Record<RpsChoice, RpsChoice> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

interface XoGame {
  type: 'xo';
  startedBy: string;
  players: [string, string];
  board: (string | null)[];
  turn: string;
  winner: string | null;
  line: number[] | null;
  draw: boolean;
}

interface RpsGame {
  type: 'rps';
  startedBy: string;
  players: [string, string];
  picks: Map<string, RpsChoice>;
  score: Map<string, number>;
  round: number;
  last: { picks: Record<string, RpsChoice>; winner: string | null } | null;
}

interface TaksaGame {
  type: 'taksa';
  startedBy: string;
  players: [string, string];
  picks: Map<string, { day: BirthDay; reveal: boolean }>;
}

interface TarotGame {
  type: 'tarot';
  startedBy: string;
  players: [string, string];
  draws: Map<string, { card: number; reversed: boolean }>;
}

export type Game = XoGame | RpsGame | TaksaGame | TarotGame;

export function isGameType(value: unknown): value is GameType {
  return GAME_TYPES.includes(value as GameType);
}

export function isRpsChoice(value: unknown): value is RpsChoice {
  return RPS_CHOICES.includes(value as RpsChoice);
}

@Injectable()
export class GamesService {
  private readonly games = new Map<string, Game>();

  get(roomId: string): Game | null {
    return this.games.get(roomId) ?? null;
  }

  start(roomId: string, type: GameType, starter: string, other: string): Game {
    const players: [string, string] = [starter, other];
    const game: Game =
      type === 'taksa'
        ? { type, startedBy: starter, players, picks: new Map() }
        : type === 'tarot'
          ? { type, startedBy: starter, players, draws: new Map() }
          : type === 'xo'
            ? {
                type,
                startedBy: starter,
                players,
                board: Array.from({ length: 9 }, () => null),
                turn: starter,
                winner: null,
                line: null,
                draw: false,
              }
            : {
                type,
                startedBy: starter,
                players,
                picks: new Map(),
                score: new Map(players.map((player) => [player, 0])),
                round: 1,
                last: null,
              };
    this.games.set(roomId, game);
    return game;
  }

  playXo(roomId: string, player: string, cell: number): Game | null {
    const game = this.games.get(roomId);
    if (game?.type !== 'xo' || game.winner || game.draw) return null;
    if (game.turn !== player || game.board[cell] !== null) return null;
    game.board[cell] = player;
    const line = XO_LINES.find((cells) =>
      cells.every((index) => game.board[index] === player),
    );
    if (line) {
      game.winner = player;
      game.line = line;
    } else if (game.board.every((value) => value !== null)) {
      game.draw = true;
    } else {
      game.turn = game.players.find((other) => other !== player) ?? player;
    }
    return game;
  }

  playRps(roomId: string, player: string, choice: RpsChoice): Game | null {
    const game = this.games.get(roomId);
    if (game?.type !== 'rps' || game.picks.has(player)) return null;
    game.picks.set(player, choice);
    if (game.picks.size < 2) return game;

    const [a, b] = game.players;
    const pickA = game.picks.get(a) as RpsChoice;
    const pickB = game.picks.get(b) as RpsChoice;
    const winner = pickA === pickB ? null : BEATS[pickA] === pickB ? a : b;
    if (winner) game.score.set(winner, (game.score.get(winner) ?? 0) + 1);
    game.last = { picks: { [a]: pickA, [b]: pickB }, winner };
    game.picks.clear();
    game.round += 1;
    return game;
  }

  pickDay(
    roomId: string,
    player: string,
    day: BirthDay,
    reveal: boolean,
  ): Game | null {
    const game = this.games.get(roomId);
    if (game?.type !== 'taksa' || game.picks.has(player)) return null;
    game.picks.set(player, { day, reveal });
    return game;
  }

  draw(roomId: string, player: string): Game | null {
    const game = this.games.get(roomId);
    if (game?.type !== 'tarot' || game.draws.has(player)) return null;
    const taken = new Set([...game.draws.values()].map(({ card }) => card));
    let card = randomInt(TAROT_CARDS);
    while (taken.has(card)) card = randomInt(TAROT_CARDS);
    game.draws.set(player, { card, reversed: randomInt(2) === 1 });
    return game;
  }

  clear(roomId: string) {
    this.games.delete(roomId);
  }
}

export function viewOf(game: Game, viewer: string) {
  const who = (id: string | null) =>
    id === null ? null : id === viewer ? 'me' : 'them';
  if (game.type === 'xo') {
    return {
      type: game.type,
      startedBy: who(game.startedBy),
      board: game.board.map(who),
      myTurn: !game.winner && !game.draw && game.turn === viewer,
      result: game.winner
        ? game.winner === viewer
          ? 'win'
          : 'lose'
        : game.draw
          ? 'draw'
          : null,
      line: game.line,
    };
  }
  const other = game.players.find((id) => id !== viewer) ?? viewer;
  if (game.type === 'taksa') {
    const mine = game.picks.get(viewer);
    const theirs = game.picks.get(other);
    const done = mine && theirs;
    return {
      type: game.type,
      startedBy: who(game.startedBy),
      myPick: mine ?? null,
      theyPicked: Boolean(theirs),
      result: done
        ? {
            theyAreMy: taksaPosition(mine.day, theirs.day),
            iAmTheir: taksaPosition(theirs.day, mine.day),
            score: Math.round(
              (TAKSA_SCORE[taksaPosition(mine.day, theirs.day)] +
                TAKSA_SCORE[taksaPosition(theirs.day, mine.day)]) /
                2,
            ),
            partnerDay: theirs.reveal ? theirs.day : null,
          }
        : null,
    };
  }
  if (game.type === 'tarot') {
    return {
      type: game.type,
      startedBy: who(game.startedBy),
      mine: game.draws.get(viewer) ?? null,
      theirs: game.draws.get(other) ?? null,
    };
  }
  return {
    type: game.type,
    startedBy: who(game.startedBy),
    round: game.round,
    myPick: game.picks.get(viewer) ?? null,
    theyPicked: game.picks.has(other),
    score: {
      me: game.score.get(viewer) ?? 0,
      them: game.score.get(other) ?? 0,
    },
    last: game.last && {
      mine: game.last.picks[viewer],
      theirs: game.last.picks[other],
      result:
        game.last.winner === null
          ? 'draw'
          : game.last.winner === viewer
            ? 'win'
            : 'lose',
    },
  };
}
