import { randomInt } from 'node:crypto';

export const BLACKJACK_MODES = ['dealer', 'duel'] as const;
export type BlackjackMode = (typeof BLACKJACK_MODES)[number];
export type BlackjackOutcome = 'blackjack' | 'win' | 'lose' | 'push';

export const TURN_TIMEOUT_MS = Number(process.env.BLACKJACK_TURN_MS ?? 30_000);
const DEALER_STANDS_AT = 17;

export interface BlackjackGame {
  type: 'blackjack';
  mode: BlackjackMode;
  startedBy: string;
  players: [string, string];
  deck: number[];
  hands: Map<string, number[]>;
  done: Set<string>;
  dealer: number[];
  finished: boolean;
  outcomes: Map<string, BlackjackOutcome>;
  wins: Map<string, number>;
  round: number;
  deadline: number;
}

export function isBlackjackMode(value: unknown): value is BlackjackMode {
  return BLACKJACK_MODES.includes(value as BlackjackMode);
}

function shuffledDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, card) => card);
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function rankValue(card: number): number {
  const rank = card % 13;
  if (rank === 0) return 1;
  return Math.min(rank + 1, 10);
}

export function handTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += rankValue(card);
    if (card % 13 === 0) aces++;
  }
  return aces > 0 && total + 10 <= 21 ? total + 10 : total;
}

export function isNatural(cards: number[]): boolean {
  return cards.length === 2 && handTotal(cards) === 21;
}

function draw(game: BlackjackGame): number {
  const card = game.deck.pop();
  if (card === undefined) throw new Error('deck empty');
  return card;
}

export function dealBlackjack(
  mode: BlackjackMode,
  starter: string,
  other: string,
  previous: BlackjackGame | null,
  now = Date.now(),
): BlackjackGame {
  const players: [string, string] = [starter, other];
  const keepScore = previous?.mode === mode;
  const game: BlackjackGame = {
    type: 'blackjack',
    mode,
    startedBy: starter,
    players,
    deck: shuffledDeck(),
    hands: new Map(),
    done: new Set(),
    dealer: [],
    finished: false,
    outcomes: new Map(),
    wins: new Map(
      players.map((player) => [
        player,
        keepScore ? (previous.wins.get(player) ?? 0) : 0,
      ]),
    ),
    round: keepScore ? previous.round + 1 : 1,
    deadline: now + TURN_TIMEOUT_MS,
  };
  for (const player of players)
    game.hands.set(player, [draw(game), draw(game)]);
  if (mode === 'dealer') game.dealer = [draw(game), draw(game)];
  for (const player of players) {
    if (isNatural(game.hands.get(player) ?? [])) game.done.add(player);
  }
  settleIfReady(game);
  return game;
}

export function hit(game: BlackjackGame, player: string, now = Date.now()) {
  if (game.finished || game.done.has(player)) return false;
  const hand = game.hands.get(player);
  if (!hand) return false;
  hand.push(draw(game));
  if (handTotal(hand) >= 21) game.done.add(player);
  game.deadline = now + TURN_TIMEOUT_MS;
  settleIfReady(game);
  return true;
}

export function stand(game: BlackjackGame, player: string, now = Date.now()) {
  if (game.finished || game.done.has(player)) return false;
  game.done.add(player);
  game.deadline = now + TURN_TIMEOUT_MS;
  settleIfReady(game);
  return true;
}

export function standAll(game: BlackjackGame) {
  if (game.finished) return false;
  for (const player of game.players) game.done.add(player);
  settleIfReady(game);
  return true;
}

function settleIfReady(game: BlackjackGame) {
  if (game.finished || game.done.size < game.players.length) return;
  if (game.mode === 'dealer') settleAgainstDealer(game);
  else settleDuel(game);
  game.finished = true;
  for (const [player, outcome] of game.outcomes) {
    if (outcome === 'win' || outcome === 'blackjack') {
      game.wins.set(player, (game.wins.get(player) ?? 0) + 1);
    }
  }
}

function settleAgainstDealer(game: BlackjackGame) {
  const anyAlive = game.players.some(
    (player) => handTotal(game.hands.get(player) ?? []) <= 21,
  );
  const dealerNatural = isNatural(game.dealer);
  if (anyAlive && !dealerNatural) {
    while (handTotal(game.dealer) < DEALER_STANDS_AT)
      game.dealer.push(draw(game));
  }
  const dealerTotal = handTotal(game.dealer);
  for (const player of game.players) {
    const hand = game.hands.get(player) ?? [];
    const total = handTotal(hand);
    let outcome: BlackjackOutcome;
    if (total > 21) outcome = 'lose';
    else if (isNatural(hand)) outcome = dealerNatural ? 'push' : 'blackjack';
    else if (dealerNatural) outcome = 'lose';
    else if (dealerTotal > 21 || total > dealerTotal) outcome = 'win';
    else if (total === dealerTotal) outcome = 'push';
    else outcome = 'lose';
    game.outcomes.set(player, outcome);
  }
}

function settleDuel(game: BlackjackGame) {
  const [a, b] = game.players;
  const score = (player: string) => {
    const hand = game.hands.get(player) ?? [];
    const total = handTotal(hand);
    if (total > 21) return -1;
    return isNatural(hand) ? 22 : total;
  };
  const scoreA = score(a);
  const scoreB = score(b);
  const outcomeFor = (mine: number, theirs: number): BlackjackOutcome => {
    if (mine === theirs) return 'push';
    if (mine > theirs) return mine === 22 ? 'blackjack' : 'win';
    return 'lose';
  };
  game.outcomes.set(a, outcomeFor(scoreA, scoreB));
  game.outcomes.set(b, outcomeFor(scoreB, scoreA));
}

export function blackjackView(game: BlackjackGame, viewer: string) {
  const other = game.players.find((id) => id !== viewer) ?? viewer;
  const mine = game.hands.get(viewer) ?? [];
  const theirs = game.hands.get(other) ?? [];
  const hideTheirs = game.mode === 'duel' && !game.finished;
  const visibleTheirs = hideTheirs ? [null, ...theirs.slice(1)] : theirs;
  const visibleDealer =
    game.mode === 'dealer'
      ? game.finished
        ? game.dealer
        : [game.dealer[0], null]
      : [];
  const total = (cards: (number | null)[]) =>
    handTotal(cards.filter((card): card is number => card !== null));

  return {
    type: game.type,
    mode: game.mode,
    startedBy: game.startedBy === viewer ? 'me' : 'them',
    round: game.round,
    finished: game.finished,
    deadline: game.deadline,
    mine: { cards: mine, total: handTotal(mine), done: game.done.has(viewer) },
    theirs: {
      cards: visibleTheirs,
      total: hideTheirs ? null : total(visibleTheirs),
      done: game.done.has(other),
    },
    dealer:
      game.mode === 'dealer'
        ? { cards: visibleDealer, total: total(visibleDealer) }
        : null,
    outcome: game.finished ? (game.outcomes.get(viewer) ?? null) : null,
    theirOutcome: game.finished ? (game.outcomes.get(other) ?? null) : null,
    wins: { me: game.wins.get(viewer) ?? 0, them: game.wins.get(other) ?? 0 },
  };
}
