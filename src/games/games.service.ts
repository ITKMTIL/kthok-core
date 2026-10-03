import { Injectable } from '@nestjs/common';

export const GAME_TYPES = ['xo', 'rps'] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const RPS_CHOICES = ['rock', 'paper', 'scissors'] as const;
export type RpsChoice = (typeof RPS_CHOICES)[number];

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

export type Game = XoGame | RpsGame;

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
      type === 'xo'
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
