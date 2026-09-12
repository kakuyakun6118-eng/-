/**
 * Question generation for the vocabulary deck.
 *
 * Every answer nudges the word's review box (src/study/srs.ts), so a word you
 * keep getting right comes back later. The questions climb the same way:
 * meaning first, then the example sentence, then spelling the thing out
 * letter by letter.
 */

import { WORDS, WordEntry, WordGroup, WordType } from "./data";
import { Question, SessionItem, SessionOptions as BaseSessionOptions } from "../study/session";
import { CardStat, orderForStudy, shuffle, Stats } from "../study/srs";

export type WordQuestion = Question<WordEntry>;
export type WordSessionItem = SessionItem<WordEntry>;

export type WordQuestionKind = "en2ja" | "ja2en" | "listen" | "cloze" | "spell" | "build";

export const WORD_KIND_LABELS: Record<WordQuestionKind, string> = {
  en2ja: "英語 → 意味",
  ja2en: "意味 → 英語",
  listen: "聞き取り",
  cloze: "例文の穴うめ",
  spell: "つづり",
  build: "語順",
};

function pickDistractors(
  entry: WordEntry,
  pool: WordEntry[],
  value: (w: WordEntry) => string,
  count = 3,
): string[] {
  const correct = value(entry);
  const seen = new Set([correct]);
  const take = (candidates: WordEntry[]) => {
    for (const candidate of shuffle(candidates)) {
      if (seen.size > count) break;
      seen.add(value(candidate));
    }
  };
  // Wrong answers from the same scene and the same kind of entry, so the
  // choice is about meaning rather than "which one is an idiom".
  take(pool.filter((w) => w.id !== entry.id && w.group === entry.group && w.type === entry.type));
  if (seen.size <= count) take(pool.filter((w) => w.id !== entry.id && w.group === entry.group));
  if (seen.size <= count) take(WORDS.filter((w) => w.id !== entry.id && w.type === entry.type));
  if (seen.size <= count) take(WORDS.filter((w) => w.id !== entry.id));
  return [...seen].filter((text) => text !== correct).slice(0, count);
}

function buildChoice(
  entry: WordEntry,
  pool: WordEntry[],
  kind: "en2ja" | "ja2en" | "listen",
): WordQuestion {
  const value = kind === "en2ja" ? (w: WordEntry) => w.ja : (w: WordEntry) => w.en;
  const answer = value(entry);
  return {
    card: entry,
    kindLabel: WORD_KIND_LABELS[kind],
    audio: kind === "listen",
    prompt:
      kind === "en2ja"
        ? entry.en
        : kind === "ja2en"
          ? entry.ja
          : "聞こえた語はどれ?",
    sub: kind === "en2ja" ? entry.kana : undefined,
    choices: shuffle([answer, ...pickDistractors(entry, pool, value)]),
    answer,
  };
}

/** Blanks the entry out of its own example sentence: "Two coffees ___, please." */
function buildCloze(entry: WordEntry, pool: WordEntry[]): WordQuestion | null {
  const at = entry.example.toLowerCase().indexOf(entry.en.toLowerCase());
  // Inflected examples ("running out of" for "run out of") have nothing to
  // blank out cleanly, so those words are asked another way.
  if (at < 0) return null;
  const blanked =
    entry.example.slice(0, at) + "_".repeat(6) + entry.example.slice(at + entry.en.length);
  const choices = pickDistractors(entry, pool, (w) => w.en);
  if (choices.length < 3) return null;
  return {
    card: entry,
    kindLabel: WORD_KIND_LABELS.cloze,
    prompt: blanked,
    sub: entry.exampleJa,
    choices: shuffle([entry.en, ...choices]),
    answer: entry.en,
  };
}

/** Letter tiles for a single word — the step where recognition becomes recall. */
function buildSpell(entry: WordEntry): WordQuestion | null {
  const word = entry.en;
  if (!/^[A-Za-z]{3,12}$/.test(word)) return null;
  const letters = word.toLowerCase().split("");
  let scrambled = shuffle(letters);
  for (let i = 0; i < 5 && scrambled.join("") === letters.join(""); i += 1) {
    scrambled = shuffle(letters);
  }
  return {
    card: entry,
    kindLabel: WORD_KIND_LABELS.spell,
    prompt: entry.ja,
    sub: entry.kana,
    tiles: {
      items: scrambled,
      joiner: "",
      placeholder: "文字をタップしてつづってください",
    },
    answer: word,
  };
}

/** Word tiles for an idiom or a two-word term: get the order right. */
function buildBuild(entry: WordEntry): WordQuestion | null {
  const tokens = entry.en.split(" ");
  if (tokens.length < 2 || tokens.length > 6) return null;
  let scrambled = shuffle(tokens);
  for (let i = 0; i < 5 && scrambled.join(" ") === entry.en; i += 1) {
    scrambled = shuffle(tokens);
  }
  return {
    card: entry,
    kindLabel: WORD_KIND_LABELS.build,
    prompt: entry.ja,
    sub: entry.kana,
    tiles: {
      items: scrambled,
      joiner: " ",
      placeholder: "語をタップして並べてください",
    },
    answer: entry.en,
  };
}

/**
 * Picks the question type for a word. Recognition first, production later: a
 * word you've only just met is a 4-択 on its meaning, one you keep getting
 * right has to be spelled out or put in order.
 */
export function buildWordQuestion(
  entry: WordEntry,
  pool: WordEntry[],
  box: number,
  canSpeak: boolean,
): WordQuestion {
  const kinds: WordQuestionKind[] =
    box <= 0
      ? ["en2ja", "en2ja", "ja2en"]
      : box === 1
        ? ["ja2en", "listen", "cloze"]
        : box === 2
          ? ["cloze", "listen", "spell", "build"]
          : ["spell", "build", "cloze", "listen"];

  for (const kind of shuffle(kinds)) {
    if (kind === "listen" && !canSpeak) continue;
    if (kind === "cloze") {
      const question = buildCloze(entry, pool);
      if (question) return question;
    } else if (kind === "spell") {
      const question = buildSpell(entry);
      if (question) return question;
    } else if (kind === "build") {
      const question = buildBuild(entry);
      if (question) return question;
    } else {
      return buildChoice(entry, pool, kind);
    }
  }
  return buildChoice(entry, pool, "en2ja");
}

export interface WordSessionOptions extends BaseSessionOptions {
  /** Restrict the deck to these scenes. Empty = everything. */
  groups?: WordGroup[];
  /** Only 単語, or only 熟語. */
  type?: WordType;
}

export function wordPool(options: WordSessionOptions = {}, stats: Stats = {}): WordEntry[] {
  const { groups = [], type, favouritesOnly = false } = options;
  let pool = WORDS;
  if (groups.length > 0) pool = pool.filter((w) => groups.includes(w.group));
  if (type) pool = pool.filter((w) => w.type === type);
  if (favouritesOnly) pool = pool.filter((w) => stats[w.id]?.fav);
  return pool;
}

/** The words a session should cover, in the order they should be studied. */
export function selectWords(stats: Stats, options: WordSessionOptions = {}): WordEntry[] {
  return orderForStudy(wordPool(options, stats), stats, options.reviewOnly ?? false);
}

export function buildWordSession(
  stats: Stats,
  options: WordSessionOptions = {},
): WordSessionItem[] {
  const { count = 10, canSpeak = false } = options;
  const chosen = selectWords(stats, options).slice(0, count);
  const pool = chosen.length >= 4 ? chosen : WORDS;

  const items: WordSessionItem[] = [];
  for (const entry of chosen) {
    const stat: CardStat | undefined = stats[entry.id];
    // A word you've never met gets shown before it gets asked.
    if (!stat || stat.last === 0) items.push({ type: "teach", card: entry });
    items.push({
      type: "quiz",
      question: buildWordQuestion(entry, pool, stat?.box ?? 0, canSpeak),
    });
  }
  return items;
}
