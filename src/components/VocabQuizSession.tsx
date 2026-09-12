import { LearnerStore } from "../hooks/useLearners";
import { WordEntry } from "../vocab/data";
import { buildWordQuestion, buildWordSession, WordSessionOptions } from "../vocab/quiz";
import { WordCard } from "./WordCard";
import { StudySession } from "./StudySession";
import { speechAvailable } from "../utils/speech";

/** The vocabulary deck's side of the shared session runner. */
export function VocabQuizSession({
  store,
  title,
  options,
  onExit,
  onRestart,
}: {
  store: LearnerStore;
  title: string;
  options: WordSessionOptions;
  onExit: () => void;
  onRestart: () => void;
}) {
  return (
    <StudySession<WordEntry>
      store={store}
      title={title}
      buildItems={() =>
        buildWordSession(store.me.stats, { ...options, canSpeak: speechAvailable() })
      }
      renderCard={(entry, compact) => (
        <WordCard
          entry={entry}
          stat={store.me.stats[entry.id]}
          onToggleFavourite={() => store.toggleFavourite(entry.id)}
          compact={compact}
        />
      )}
      speechText={(entry) => entry.en}
      buildRetry={(entry, pool) => buildWordQuestion(entry, pool, 0, speechAvailable())}
      teachLabel="はじめての単語"
      emptyMessage="この条件で出題できる単語がありません。別のシーンを選んでください。"
      missedTitle="まちがえた単語"
      onExit={onExit}
      onRestart={onRestart}
    />
  );
}
