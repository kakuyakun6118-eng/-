/**
 * Shapes shared by every study session in the app.
 *
 * A deck (src/vocab) decides *what* to ask; the session runner
 * (src/components/StudySession.tsx) only knows how to show these.
 */

import { Card, normalise } from "./srs";

/** Tap-the-tiles answer: words for a sentence, letters for spelling. */
export interface TileAnswer {
  items: string[];
  /** " " joins word tiles into a sentence, "" joins letters into a word. */
  joiner: string;
  placeholder: string;
}

export interface Question<T extends Card> {
  card: T;
  /** Question type shown above the prompt, e.g. "日本語 → 英語". */
  kindLabel: string;
  /** The prompt is the audio itself, so the session plays it and hides the text. */
  audio?: boolean;
  /** Main text shown to the learner. */
  prompt: string;
  /** Extra line under the prompt, e.g. the sentence with a blank. */
  sub?: string;
  /** Multiple-choice options, already in display order. */
  choices?: string[];
  tiles?: TileAnswer;
  /** The correct answer, compared after normalisation. */
  answer: string;
}

export type SessionItem<T extends Card> =
  | { type: "teach"; card: T }
  | { type: "quiz"; question: Question<T> };

export interface SessionOptions {
  /** How many questions to ask. */
  count?: number;
  /** Only cards that are due for review (no new ones). */
  reviewOnly?: boolean;
  /** Only cards marked with a star. */
  favouritesOnly?: boolean;
  /** Speech synthesis is usable, so listening questions are fair game. */
  canSpeak?: boolean;
}

export function isCorrect<T extends Card>(question: Question<T>, given: string): boolean {
  return normalise(given) === normalise(question.answer);
}
