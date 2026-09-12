/**
 * The little spaced-repetition scheduler behind every deck in the app.
 *
 * Deck-agnostic on purpose: phrases (src/phrases) and vocabulary
 * (src/vocab) share one review-box model and one `stats` map on the
 * learner record, keyed by card id. Ids carry a per-deck prefix, so the two
 * decks never collide.
 */

/** Anything that can be reviewed: a phrase, a word, an idiom. */
export interface Card {
  id: string;
}

export interface CardStat {
  /** Review box 0–5. Higher = seen correctly more often, shown less often. */
  box: number;
  /** Epoch ms when this card should come back. */
  due: number;
  right: number;
  wrong: number;
  /** Epoch ms of the last answer. */
  last: number;
  fav?: boolean;
}

export type Stats = Record<string, CardStat>;

/** Days until a card in each box comes back around. */
const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14];
export const MAX_BOX = INTERVAL_DAYS.length - 1;
/** From this box up a card counts as "習得済み". */
export const MASTER_BOX = 4;
const DAY_MS = 86400000;

export function emptyStat(): CardStat {
  return { box: 0, due: 0, right: 0, wrong: 0, last: 0 };
}

export function nextStat(prev: CardStat | undefined, correct: boolean): CardStat {
  const base = prev ?? emptyStat();
  const box = correct ? Math.min(MAX_BOX, base.box + 1) : 0;
  const now = Date.now();
  return {
    box,
    // A miss comes back inside the same session; a hit waits out its interval.
    due: correct ? now + INTERVAL_DAYS[box] * DAY_MS : now,
    right: base.right + (correct ? 1 : 0),
    wrong: base.wrong + (correct ? 0 : 1),
    last: now,
    ...(base.fav ? { fav: true } : {}),
  };
}

export function isSeen(stat: CardStat | undefined): boolean {
  return !!stat && stat.last > 0;
}

export function isDue(stat: CardStat | undefined, now = Date.now()): boolean {
  if (!stat || stat.last === 0) return false;
  return stat.due <= now;
}

export function isMastered(stat: CardStat | undefined): boolean {
  return (stat?.box ?? 0) >= MASTER_BOX;
}

export function countProgress(stats: Stats, pool: Card[]) {
  let learning = 0;
  let mastered = 0;
  let due = 0;
  const now = Date.now();
  for (const card of pool) {
    const stat = stats[card.id];
    if (!isSeen(stat)) continue;
    if (isMastered(stat)) mastered += 1;
    else learning += 1;
    if (isDue(stat, now)) due += 1;
  }
  return {
    total: pool.length,
    learning,
    mastered,
    due,
    fresh: pool.length - learning - mastered,
  };
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Orders a deck the way a study session should go: what you got wrong and
 * what's due first, then cards you've never seen, then everything else as
 * light review.
 */
export function orderForStudy<T extends Card>(
  pool: T[],
  stats: Stats,
  reviewOnly = false,
): T[] {
  const now = Date.now();
  const due: T[] = [];
  const fresh: T[] = [];
  const rest: T[] = [];
  for (const card of pool) {
    const stat = stats[card.id];
    if (!isSeen(stat)) fresh.push(card);
    else if (isDue(stat, now)) due.push(card);
    else rest.push(card);
  }

  // Weakest first among the due ones: low box, then most-missed.
  due.sort((a, b) => {
    const sa = stats[a.id];
    const sb = stats[b.id];
    return sa.box - sb.box || sb.wrong - sa.wrong || sa.due - sb.due;
  });

  if (reviewOnly) return due;
  return [...due, ...shuffle(fresh), ...rest.sort((a, b) => stats[a.id].due - stats[b.id].due)];
}

/** 10 points a question, plus a small bonus that grows with the streak. */
export function scoreFor(combo: number): number {
  return 10 + Math.min(combo, 5) * 2;
}

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
