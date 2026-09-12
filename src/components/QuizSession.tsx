import { LearnerStore } from "../hooks/useLearners";
import { Phrase } from "../phrases/data";
import { buildQuestion, buildSession, SessionOptions } from "../phrases/quiz";
import { PhraseCard } from "./PhraseCard";
import { StudySession } from "./StudySession";
import { speechAvailable } from "../utils/speech";

/** The phrase deck's side of the shared session runner. */
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
  return (
    <StudySession<Phrase>
      store={store}
      title={title}
      buildItems={() =>
        buildSession(store.me.stats, { ...options, canSpeak: speechAvailable() })
      }
      renderCard={(phrase, compact) => (
        <PhraseCard
          phrase={phrase}
          stat={store.me.stats[phrase.id]}
          onToggleFavourite={() => store.toggleFavourite(phrase.id)}
          compact={compact}
        />
      )}
      speechText={(phrase) => phrase.en}
      buildRetry={(phrase, pool) => buildQuestion(phrase, pool, 0, speechAvailable())}
      teachLabel="はじめてのフレーズ"
      emptyMessage="このシーンには出題できるフレーズがありません。別のシーンを選んでください。"
      missedTitle="まちがえたフレーズ"
      onExit={onExit}
      onRestart={onRestart}
    />
  );
}
