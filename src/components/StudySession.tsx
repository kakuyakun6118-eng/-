import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LearnerStore } from "../hooks/useLearners";
import { Card, normalise, scoreFor } from "../study/srs";
import { isCorrect, Question, SessionItem } from "../study/session";
import { speak, stopSpeaking } from "../utils/speech";

interface Result<T extends Card> {
  card: T;
  correct: boolean;
}

/**
 * Runs one study session: asks the questions a deck built, scores them and
 * feeds every answer back into the learner's review boxes.
 *
 * Deck-agnostic — the phrase deck and the vocabulary deck both drive it, each
 * supplying its own questions and its own card rendering.
 */
export function StudySession<T extends Card>({
  store,
  title,
  buildItems,
  renderCard,
  speechText,
  buildRetry,
  teachLabel,
  emptyMessage,
  missedTitle,
  onExit,
  onRestart,
}: {
  store: LearnerStore;
  title: string;
  /** Called once per session — answering must not reshuffle the questions. */
  buildItems: () => SessionItem<T>[];
  renderCard: (card: T, compact: boolean) => ReactNode;
  /** English read aloud for listening questions. */
  speechText: (card: T) => string;
  /** One extra go at a card that was missed, asked at the end of the session. */
  buildRetry: (card: T, pool: T[]) => Question<T>;
  teachLabel: string;
  emptyMessage: string;
  missedTitle: string;
  onExit: () => void;
  onRestart: () => void;
}) {
  const [items, setItems] = useState<SessionItem<T>[]>(buildItems);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean; given: string } | null>(null);
  const [placed, setPlaced] = useState<number[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [earned, setEarned] = useState(0);
  const [results, setResults] = useState<Result<T>[]>([]);
  /** A card only gets one extra go per session, or a bad one loops forever. */
  const retried = useRef<Set<string>>(new Set());
  /** Read through a ref so an inline `speechText` prop can't replay the audio. */
  const speechTextRef = useRef(speechText);
  speechTextRef.current = speechText;

  const current = items[index];
  const question = current?.type === "quiz" ? current.question : null;

  // Listening questions are the question, so play them as they come up.
  useEffect(() => {
    if (question?.audio && !answered) speak(speechTextRef.current(question.card));
  }, [question, answered]);

  useEffect(() => () => stopSpeaking(), []);

  const finished = index >= items.length;
  const correctCount = results.filter((r) => r.correct).length;
  /** One entry per card, even when it was missed twice. */
  const missed = useMemo(() => {
    const seen = new Set<string>();
    const out: Result<T>[] = [];
    for (const result of results) {
      if (result.correct || seen.has(result.card.id)) continue;
      seen.add(result.card.id);
      out.push(result);
    }
    return out;
  }, [results]);

  if (items.length === 0) {
    return (
      <div className="tab-content">
        <SessionHeader title={title} onExit={onExit} />
        <p className="empty-state">{emptyMessage}</p>
      </div>
    );
  }

  if (finished) {
    const total = results.length;
    const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="tab-content">
        <SessionHeader title="おつかれさまでした" onExit={onExit} exitLabel="閉じる" />
        <div className="ph-result">
          <p className="ph-result-score">
            {correctCount}
            <span className="ph-result-total"> / {total}</span>
          </p>
          <p className="ph-result-rate">正答率 {rate}%</p>
          <div className="ph-result-stats">
            <span>+{earned} XP</span>
            <span>最大コンボ {bestCombo}</span>
          </div>
          <p className="ph-result-comment">
            {rate === 100
              ? "完璧です! この調子ならNYで困りません 🗽"
              : rate >= 70
                ? "いい感じです。まちがえた分は明日また出題されます"
                : "まちがえた分はすぐに復習に戻ってきます。焦らずいきましょう"}
          </p>
        </div>

        {missed.length > 0 && (
          <>
            <h3 className="ph-section-title">{missedTitle}</h3>
            {missed.map((r) => (
              <div key={r.card.id}>{renderCard(r.card, true)}</div>
            ))}
          </>
        )}

        <div className="ph-result-actions">
          <button className="btn-primary btn-block" onClick={onRestart}>
            もう1セット
          </button>
          <button className="btn-secondary btn-block" onClick={onExit}>
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const advance = () => {
    setAnswered(null);
    setPlaced([]);
    setIndex((i) => i + 1);
  };

  const submit = (given: string) => {
    if (!question || answered) return;
    const correct = isCorrect(question, given);
    setAnswered({ correct, given });
    setResults((prev) => [...prev, { card: question.card, correct }]);
    if (correct) {
      setEarned((xp) => xp + scoreFor(combo));
      setCombo((c) => {
        const next = c + 1;
        setBestCombo((best) => Math.max(best, next));
        return next;
      });
    } else {
      setCombo(0);
      // Give it one more go at the end of the session while it's still fresh.
      if (!retried.current.has(question.card.id)) {
        retried.current.add(question.card.id);
        setItems((prev) => [
          ...prev,
          {
            type: "quiz",
            question: buildRetry(
              question.card,
              prev.map((item) => (item.type === "quiz" ? item.question.card : item.card)),
            ),
          },
        ]);
      }
    }
    store.recordAnswer(question.card.id, correct, combo);
  };

  // Teach cards aren't questions, so they must not inflate the count.
  const questionTotal = items.filter((item) => item.type === "quiz").length;
  const questionNumber = Math.min(results.length + (answered ? 0 : 1), questionTotal);
  const progress = Math.round((results.length / questionTotal) * 100);

  return (
    <div className="tab-content">
      <SessionHeader title={title} onExit={onExit} />

      <div className="ph-progress">
        <div className="ph-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="ph-progress-meta">
          <span>
            {questionNumber} / {questionTotal}問
          </span>
          <span>
            {combo >= 2 && <b className="ph-combo">🔥 {combo}連続</b>} +{earned} XP
          </span>
        </div>
      </div>

      {current.type === "teach" ? (
        <div className="ph-teach">
          <p className="ph-teach-label">{teachLabel}</p>
          {renderCard(current.card, false)}
          <button className="btn-primary btn-block" onClick={advance}>
            覚えた!次へ
          </button>
        </div>
      ) : (
        question && (
          <>
            <p className="ph-kind">{question.kindLabel}</p>

            {question.audio ? (
              <div className="ph-listen">
                <button
                  className="ph-listen-btn"
                  onClick={() => speak(speechText(question.card))}
                >
                  🔊
                </button>
                <button
                  className="ph-speak"
                  onClick={() => speak(speechText(question.card), 0.6)}
                >
                  🐢 ゆっくりもう一度
                </button>
                <p className="ph-listen-hint">{question.prompt}</p>
              </div>
            ) : (
              <div className="ph-prompt">
                <p className="ph-prompt-main">{question.prompt}</p>
                {question.sub && <p className="ph-prompt-sub">{question.sub}</p>}
              </div>
            )}

            {question.tiles ? (
              <TileAnswerPad
                tiles={question.tiles}
                placed={placed}
                setPlaced={setPlaced}
                locked={answered !== null}
                onSubmit={submit}
              />
            ) : (
              <div className="ph-choices">
                {question.choices?.map((choice) => {
                  const state = !answered
                    ? ""
                    : normalise(choice) === normalise(question.answer)
                      ? "right"
                      : normalise(choice) === normalise(answered.given)
                        ? "wrong"
                        : "dim";
                  return (
                    <button
                      key={choice}
                      className={`ph-choice ${state}`}
                      disabled={answered !== null}
                      onClick={() => submit(choice)}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
            )}

            {answered && (
              <div className={`ph-feedback ${answered.correct ? "right" : "wrong"}`}>
                <p className="ph-feedback-head">
                  {answered.correct ? "⭕️ 正解!" : "❌ おしい!正解はこちら"}
                </p>
                {renderCard(question.card, true)}
                <button className="btn-primary btn-block" onClick={advance}>
                  次へ
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

function SessionHeader({
  title,
  onExit,
  exitLabel = "やめる",
}: {
  title: string;
  onExit: () => void;
  exitLabel?: string;
}) {
  return (
    <div className="tab-header-row">
      <h2>{title}</h2>
      <button className="btn-secondary" onClick={onExit}>
        {exitLabel}
      </button>
    </div>
  );
}

/** Tiles you tap in order: words to build a sentence, letters to spell a word. */
function TileAnswerPad({
  tiles,
  placed,
  setPlaced,
  locked,
  onSubmit,
}: {
  tiles: { items: string[]; joiner: string; placeholder: string };
  placed: number[];
  setPlaced: (next: number[]) => void;
  locked: boolean;
  onSubmit: (given: string) => void;
}) {
  const used = new Set(placed);
  const answer = placed.map((i) => tiles.items[i]).join(tiles.joiner);
  const letters = tiles.joiner === "";

  return (
    <div className="ph-arrange">
      <div className={`ph-arrange-answer ${letters ? "letters" : ""}`}>
        {placed.length === 0 ? (
          <span className="ph-arrange-placeholder">{tiles.placeholder}</span>
        ) : (
          placed.map((tileIndex, position) => (
            <button
              key={`${tileIndex}-${position}`}
              className={`ph-token placed ${letters ? "letter" : ""}`}
              disabled={locked}
              onClick={() => setPlaced(placed.filter((_, p) => p !== position))}
            >
              {tiles.items[tileIndex]}
            </button>
          ))
        )}
      </div>
      <div className="ph-arrange-pool">
        {tiles.items.map((tile, tileIndex) =>
          used.has(tileIndex) ? (
            <span key={tileIndex} className={`ph-token spent ${letters ? "letter" : ""}`} />
          ) : (
            <button
              key={tileIndex}
              className={`ph-token ${letters ? "letter" : ""}`}
              disabled={locked}
              onClick={() => setPlaced([...placed, tileIndex])}
            >
              {tile}
            </button>
          ),
        )}
      </div>
      <button
        className="btn-primary btn-block"
        disabled={locked || placed.length !== tiles.items.length}
        onClick={() => onSubmit(answer)}
      >
        答え合わせ
      </button>
    </div>
  );
}
