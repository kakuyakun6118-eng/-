/**
 * Question generation and the little spaced-repetition scheduler behind it.
 *
 * Everything runs on the device: questions are built from the bundled deck
 * (src/phrases/data.ts) and each answer nudges the phrase's review box, so the
 * app keeps resurfacing what you actually get wrong instead of drilling the
 * phrases you already know.
 */

import { Phrase, PHRASES, Situation } from "./data";

export interface PhraseStat {
  /** Review box 0–5. Higher = seen correctly more often, shown less often. */
  box: number;
  /** Epoch ms when this phrase should come back. */
  due: number;
  right: number;
  wrong: number;
  /** Epoch ms of the last answer. */
  last: number;
  fav?: boolean;
}

/** Days until a phrase in each box comes back around. */
const INTERVAL_DAYS = [0, 1, 2, 4, 7, 14];
export const MAX_BOX = INTERVAL_DAYS.length - 1;
/** From this box up a phrase counts as "習得済み". */
export const MASTER_BOX = 4;
const DAY_MS = 86400000;

export function emptyStat(): PhraseStat {
  return { box: 0, due: 0, right: 0, wrong: 0, last: 0 };
}

export function nextStat(prev: PhraseStat | undefined, correct: boolean): PhraseStat {
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

export function isDue(stat: PhraseStat | undefined, now = Date.now()): boolean {
  if (!stat || stat.last === 0) return false;
  return stat.due <= now;
}

export function isMastered(stat: PhraseStat | undefined): boolean {
  return (stat?.box ?? 0) >= MASTER_BOX;
}

export type Stats = Record<string, PhraseStat>;

export function countProgress(stats: Stats, pool: Phrase[] = PHRASES) {
  let learning = 0;
  let mastered = 0;
  let due = 0;
  const now = Date.now();
  for (const phrase of pool) {
    const stat = stats[phrase.id];
    if (!stat || stat.last === 0) continue;
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

// ---------------------------------------------------------------- questions

export type QuestionKind = "ja2en" | "en2ja" | "listen" | "arrange" | "fill";

export const KIND_LABELS: Record<QuestionKind, string> = {
  ja2en: "日本語 → 英語",
  en2ja: "英語 → 日本語",
  listen: "聞き取り",
  arrange: "並べかえ",
  fill: "穴うめ",
};

export interface Question {
  kind: QuestionKind;
  phrase: Phrase;
  /** Main text shown to the learner (hidden for listening questions). */
  prompt: string;
  /** Extra line under the prompt, e.g. the sentence with a blank. */
  sub?: string;
  /** Multiple-choice options, in display order. */
  choices?: string[];
  /** Shuffled word tiles for 並べかえ. */
  tokens?: string[];
  /** The correct answer, compared after normalisation. */
  answer: string;
}

export type SessionItem =
  | { type: "teach"; phrase: Phrase }
  | { type: "quiz"; question: Question };

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickDistractors(
  phrase: Phrase,
  pool: Phrase[],
  value: (p: Phrase) => string,
  count = 3,
): string[] {
  const correct = value(phrase);
  const seen = new Set([correct]);
  const take = (candidates: Phrase[]) => {
    for (const candidate of shuffle(candidates)) {
      if (seen.size > count) break;
      const text = value(candidate);
      if (seen.has(text)) continue;
      seen.add(text);
    }
  };
  // Same-situation wrong answers make the choice a real decision rather than
  // "which one mentions a hotel".
  take(pool.filter((p) => p.situation === phrase.situation && p.id !== phrase.id));
  if (seen.size <= count) take(PHRASES.filter((p) => p.id !== phrase.id));
  const out = [...seen].filter((text) => text !== correct).slice(0, count);
  return out;
}

const STOP_WORDS = new Set([
  "this","that","these","those","have","with","from","your","their","there",
  "here","please","would","could","about","what","when","where","some","they",
  "them","then","than","just","like","time","much","many","been","does","doing",
]);

/** Strips the punctuation that would make a typed/tapped answer look wrong. */
function bareWord(word: string): string {
  return word.replace(/[^A-Za-z'-]/g, "");
}

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFill(phrase: Phrase, pool: Phrase[]): Question | null {
  const words = phrase.en.split(" ");
  const candidates = words
    .map((word, index) => ({ word, index, bare: bareWord(word).toLowerCase() }))
    .filter((w) => w.bare.length >= 4 && !STOP_WORDS.has(w.bare));
  if (candidates.length === 0) return null;
  const target = candidates[Math.floor(Math.random() * candidates.length)];

  const others = new Set<string>();
  for (const candidate of shuffle([...pool, ...PHRASES])) {
    if (others.size >= 3) break;
    if (candidate.id === phrase.id) continue;
    for (const word of candidate.en.split(" ")) {
      const bare = bareWord(word).toLowerCase();
      if (bare.length >= 4 && !STOP_WORDS.has(bare) && bare !== target.bare) {
        others.add(bare);
        break;
      }
    }
  }
  if (others.size < 3) return null;

  const answer = target.bare;
  const blanked = words
    .map((word, index) => (index === target.index ? word.replace(bareWord(word), "____") : word))
    .join(" ");
  return {
    kind: "fill",
    phrase,
    prompt: phrase.ja,
    sub: blanked,
    choices: shuffle([answer, ...others]),
    answer,
  };
}

function buildArrange(phrase: Phrase): Question | null {
  const tokens = phrase.en.split(" ");
  if (tokens.length < 4 || tokens.length > 9) return null;
  let scrambled = shuffle(tokens);
  // A shuffle that lands back on the original sentence isn't a question.
  for (let i = 0; i < 5 && scrambled.join(" ") === phrase.en; i += 1) {
    scrambled = shuffle(tokens);
  }
  return {
    kind: "arrange",
    phrase,
    prompt: phrase.ja,
    tokens: scrambled,
    answer: phrase.en,
  };
}

function buildChoice(phrase: Phrase, pool: Phrase[], kind: "ja2en" | "en2ja" | "listen"): Question {
  const value = kind === "en2ja" ? (p: Phrase) => p.ja : (p: Phrase) => p.en;
  const answer = value(phrase);
  return {
    kind,
    phrase,
    prompt: kind === "ja2en" ? phrase.ja : kind === "en2ja" ? phrase.en : "🔊 聞こえた英語は?",
    choices: shuffle([answer, ...pickDistractors(phrase, pool, value)]),
    answer,
  };
}

/**
 * Picks the question type for a phrase. Recognition first, production later:
 * a phrase you've only just met is asked as 4-択, one you keep getting right
 * has to be built word by word.
 */
export function buildQuestion(
  phrase: Phrase,
  pool: Phrase[],
  box: number,
  canSpeak: boolean,
): Question {
  const kinds: QuestionKind[] =
    box <= 0
      ? ["ja2en", "en2ja"]
      : box === 1
        ? ["ja2en", "listen", "fill"]
        : box === 2
          ? ["listen", "fill", "arrange"]
          : ["arrange", "fill", "listen"];

  for (const kind of shuffle(kinds)) {
    if (kind === "listen" && !canSpeak) continue;
    if (kind === "arrange") {
      const question = buildArrange(phrase);
      if (question) return question;
    } else if (kind === "fill") {
      const question = buildFill(phrase, pool);
      if (question) return question;
    } else {
      return buildChoice(phrase, pool, kind);
    }
  }
  return buildChoice(phrase, pool, "ja2en");
}

export interface SessionOptions {
  /** Restrict the deck to these situations. Empty = everything. */
  situations?: Situation[];
  /** How many questions to ask. */
  count?: number;
  /** Only phrases that are due for review (no new ones). */
  reviewOnly?: boolean;
  /** Only phrases marked with a star. */
  favouritesOnly?: boolean;
  /** Speech synthesis is usable, so listening questions are fair game. */
  canSpeak?: boolean;
}

/**
 * Orders the deck the way a study session should go: what you got wrong and
 * what's due first, then phrases you've never seen, then everything else as
 * light review.
 */
export function selectPhrases(stats: Stats, options: SessionOptions = {}): Phrase[] {
  const { situations = [], favouritesOnly = false, reviewOnly = false } = options;
  const now = Date.now();

  let pool = PHRASES;
  if (situations.length > 0) pool = pool.filter((p) => situations.includes(p.situation));
  if (favouritesOnly) pool = pool.filter((p) => stats[p.id]?.fav);

  const due: Phrase[] = [];
  const fresh: Phrase[] = [];
  const rest: Phrase[] = [];
  for (const phrase of pool) {
    const stat = stats[phrase.id];
    if (!stat || stat.last === 0) fresh.push(phrase);
    else if (isDue(stat, now)) due.push(phrase);
    else rest.push(phrase);
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

export function buildSession(stats: Stats, options: SessionOptions = {}): SessionItem[] {
  const { count = 10, canSpeak = false } = options;
  const chosen = selectPhrases(stats, options).slice(0, count);
  const pool = chosen.length >= 4 ? chosen : PHRASES;

  const items: SessionItem[] = [];
  for (const phrase of chosen) {
    const stat = stats[phrase.id];
    // A phrase you've never met gets shown before it gets asked.
    if (!stat || stat.last === 0) items.push({ type: "teach", phrase });
    items.push({
      type: "quiz",
      question: buildQuestion(phrase, pool, stat?.box ?? 0, canSpeak),
    });
  }
  return items;
}

export function isCorrect(question: Question, given: string): boolean {
  return normalise(given) === normalise(question.answer);
}

/** 10 points a question, plus a small bonus that grows with the streak. */
export function scoreFor(combo: number): number {
  return 10 + Math.min(combo, 5) * 2;
}
