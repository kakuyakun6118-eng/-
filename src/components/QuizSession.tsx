import { useEffect, useMemo, useRef, useState } from "react";
import { LearnerStore } from "../hooks/useLearners";
import { Phrase } from "../phrases/data";
import {
  buildQuestion,
  buildSession,
  isCorrect,
  KIND_LABELS,
  normalise,
  Question,
  scoreFor,
  SessionItem,
  SessionOptions,
} from "../phrases/quiz";
import { PhraseCard } from "./PhraseCard";
import { speak, speechAvailable, stopSpeaking } from "../utils/speech";

interface Result {
  phrase: Phrase;
  correct: boolean;
}

export function QuizSession({
  store,
  title,
  options,
  onExit,
  onRestart,
}: {
  store: LearnerStore;
  title: string;
  options: SessionOptions;
  onExit: () => void;
  onRestart: () => void;
}) {
  // Built once per session so answering doesn't reshuffle the questions.
  const [items, setItems] = useState<SessionItem[]>(() =>
    buildSession(store.me.stats, { ...options, canSpeak: speechAvailable() }),
  );
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean; given: string } | null>(null);
  const [placed, setPlaced] = useState<number[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [earned, setEarned] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  /** A phrase only gets one extra go per session, or a bad one loops forever. */
  const retried = useRef<Set<string>>(new Set());

  const current = items[index];
  const question = current?.type === "quiz" ? current.question : null;

  // Listening questions are the question, so play them as they come up.
  useEffect(() => {
    if (question?.kind === "listen" && !answered) speak(question.phrase.en);
  }, [question, answered]);

  useEffect(() => () => stopSpeaking(), []);

  const finished = index >= items.length;
  const correctCount = results.filter((r) => r.correct).length;
  /** One entry per phrase, even when it was missed twice. */
  const missed = useMemo(() => {
    const seen = new Set<string>();
    const out: Result[] = [];
    for (const result of results) {
      if (result.correct || seen.has(result.phrase.id)) continue;
      seen.add(result.phrase.id);
      out.push(result);
    }
    return out;
  }, [results]);

  if (items.length === 0) {
    return (
      <div className="tab-content">
        <SessionHeader title={title} onExit={onExit} />
        <p className="empty-state">
          このシーンには出題できるフレーズがありません。別のシーンを選んでください。
        </p>
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
                ? "いい感じです。まちがえたフレーズは明日また出題されます"
                : "まちがえたフレーズはすぐに復習に戻ってきます。焦らずいきましょう"}
          </p>
        </div>

        {missed.length > 0 && (
          <>
            <h3 className="ph-section-title">まちがえたフレーズ</h3>
            {missed.map((r) => (
              <PhraseCard
                key={r.phrase.id}
                phrase={r.phrase}
                stat={store.me.stats[r.phrase.id]}
                onToggleFavourite={() => store.toggleFavourite(r.phrase.id)}
                compact
              />
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
    setResults((prev) => [...prev, { phrase: question.phrase, correct }]);
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
      if (!retried.current.has(question.phrase.id)) {
        retried.current.add(question.phrase.id);
        setItems((prev) => [
          ...prev,
          {
            type: "quiz",
            question: buildQuestion(
              question.phrase,
              prev.map((item) => (item.type === "quiz" ? item.question.phrase : item.phrase)),
              0,
              speechAvailable(),
            ),
          },
        ]);
      }
    }
    store.recordAnswer(question.phrase.id, correct, combo);
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
          <p className="ph-teach-label">はじめてのフレーズ</p>
          <PhraseCard
            phrase={current.phrase}
            stat={store.me.stats[current.phrase.id]}
            onToggleFavourite={() => store.toggleFavourite(current.phrase.id)}
          />
          <button className="btn-primary btn-block" onClick={advance}>
            覚えた!次へ
          </button>
        </div>
      ) : (
        question && (
          <>
            <p className="ph-kind">{KIND_LABELS[question.kind]}</p>

            {question.kind === "listen" ? (
              <div className="ph-listen">
                <button className="ph-listen-btn" onClick={() => speak(question.phrase.en)}>
                  🔊
                </button>
                <button className="ph-speak" onClick={() => speak(question.phrase.en, 0.6)}>
                  🐢 ゆっくりもう一度
                </button>
                <p className="ph-listen-hint">聞こえた英語はどれ?</p>
              </div>
            ) : (
              <div className="ph-prompt">
                <p className="ph-prompt-main">{question.prompt}</p>
                {question.sub && <p className="ph-prompt-sub">{question.sub}</p>}
              </div>
            )}

            {question.kind === "arrange" ? (
              <ArrangeAnswer
                question={question}
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
                <PhraseCard
                  phrase={question.phrase}
                  stat={store.me.stats[question.phrase.id]}
                  onToggleFavourite={() => store.toggleFavourite(question.phrase.id)}
                  compact
                />
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

/** Word tiles you tap in order to build the sentence. */
function ArrangeAnswer({
  question,
  placed,
  setPlaced,
  locked,
  onSubmit,
}: {
  question: Question;
  placed: number[];
  setPlaced: (next: number[]) => void;
  locked: boolean;
  onSubmit: (given: string) => void;
}) {
  const tokens = question.tokens ?? [];
  const used = new Set(placed);
  const sentence = placed.map((i) => tokens[i]).join(" ");

  return (
    <div className="ph-arrange">
      <div className="ph-arrange-answer">
        {placed.length === 0 ? (
          <span className="ph-arrange-placeholder">下の単語をタップして並べてください</span>
        ) : (
          placed.map((tokenIndex, position) => (
            <button
              key={`${tokenIndex}-${position}`}
              className="ph-token placed"
              disabled={locked}
              onClick={() => setPlaced(placed.filter((_, p) => p !== position))}
            >
              {tokens[tokenIndex]}
            </button>
          ))
        )}
      </div>
      <div className="ph-arrange-pool">
        {tokens.map((token, tokenIndex) =>
          used.has(tokenIndex) ? (
            <span key={tokenIndex} className="ph-token spent" />
          ) : (
            <button
              key={tokenIndex}
              className="ph-token"
              disabled={locked}
              onClick={() => setPlaced([...placed, tokenIndex])}
            >
              {token}
            </button>
          ),
        )}
      </div>
      <button
        className="btn-primary btn-block"
        disabled={locked || placed.length !== tokens.length}
        onClick={() => onSubmit(sentence)}
      >
        答え合わせ
      </button>
    </div>
  );
}
