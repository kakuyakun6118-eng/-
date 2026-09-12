/**
 * Question generation for the phrase deck.
 *
 * Everything runs on the device: questions are built from the bundled deck
 * (src/phrases/data.ts) and each answer nudges the phrase's review box (see
 * src/study/srs.ts), so the app keeps resurfacing what you actually get wrong
 * instead of drilling the phrases you already know.
 */

import { Phrase, PHRASES, Situation } from "./data";
import { Question, SessionItem, SessionOptions as BaseSessionOptions } from "../study/session";
import { CardStat, orderForStudy, shuffle, Stats } from "../study/srs";

export type PhraseQuestion = Question<Phrase>;
export type PhraseSessionItem = SessionItem<Phrase>;

export type QuestionKind = "ja2en" | "en2ja" | "listen" | "arrange" | "fill";

export const KIND_LABELS: Record<QuestionKind, string> = {
  ja2en: "日本語 → 英語",
  en2ja: "英語 → 日本語",
  listen: "聞き取り",
  arrange: "並べかえ",
  fill: "穴うめ",
};

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

function buildFill(phrase: Phrase, pool: Phrase[]): PhraseQuestion | null {
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
    card: phrase,
    kindLabel: KIND_LABELS.fill,
    prompt: phrase.ja,
    sub: blanked,
    choices: shuffle([answer, ...others]),
    answer,
  };
}

function buildArrange(phrase: Phrase): PhraseQuestion | null {
  const tokens = phrase.en.split(" ");
  if (tokens.length < 4 || tokens.length > 9) return null;
  let scrambled = shuffle(tokens);
  // A shuffle that lands back on the original sentence isn't a question.
  for (let i = 0; i < 5 && scrambled.join(" ") === phrase.en; i += 1) {
    scrambled = shuffle(tokens);
  }
  return {
    card: phrase,
    kindLabel: KIND_LABELS.arrange,
    prompt: phrase.ja,
    tiles: {
      items: scrambled,
      joiner: " ",
      placeholder: "下の単語をタップして並べてください",
    },
    answer: phrase.en,
  };
}

function buildChoice(
  phrase: Phrase,
  pool: Phrase[],
  kind: "ja2en" | "en2ja" | "listen",
): PhraseQuestion {
  const value = kind === "en2ja" ? (p: Phrase) => p.ja : (p: Phrase) => p.en;
  const answer = value(phrase);
  return {
    card: phrase,
    kindLabel: KIND_LABELS[kind],
    audio: kind === "listen",
    prompt: kind === "ja2en" ? phrase.ja : kind === "en2ja" ? phrase.en : "聞こえた英語はどれ?",
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
): PhraseQuestion {
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

export interface SessionOptions extends BaseSessionOptions {
  /** Restrict the deck to these situations. Empty = everything. */
  situations?: Situation[];
}

/** The phrases a session should cover, in the order they should be studied. */
export function selectPhrases(stats: Stats, options: SessionOptions = {}): Phrase[] {
  const { situations = [], favouritesOnly = false, reviewOnly = false } = options;

  let pool = PHRASES;
  if (situations.length > 0) pool = pool.filter((p) => situations.includes(p.situation));
  if (favouritesOnly) pool = pool.filter((p) => stats[p.id]?.fav);

  return orderForStudy(pool, stats, reviewOnly);
}

export function buildSession(stats: Stats, options: SessionOptions = {}): PhraseSessionItem[] {
  const { count = 10, canSpeak = false } = options;
  const chosen = selectPhrases(stats, options).slice(0, count);
  const pool = chosen.length >= 4 ? chosen : PHRASES;

  const items: PhraseSessionItem[] = [];
  for (const phrase of chosen) {
    const stat: CardStat | undefined = stats[phrase.id];
    // A phrase you've never met gets shown before it gets asked.
    if (!stat || stat.last === 0) items.push({ type: "teach", card: phrase });
    items.push({
      type: "quiz",
      question: buildQuestion(phrase, pool, stat?.box ?? 0, canSpeak),
    });
  }
  return items;
}
