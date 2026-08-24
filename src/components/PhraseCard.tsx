import { Phrase } from "../phrases/data";
import { PhraseStat } from "../phrases/quiz";
import { speak, speechAvailable } from "../utils/speech";

/**
 * One phrase, expanded: what to say, how to say it, and why. Shared by the
 * phrase book and the answer reveal in a quiz.
 */
export function PhraseCard({
  phrase,
  stat,
  onToggleFavourite,
  compact = false,
}: {
  phrase: Phrase;
  stat?: PhraseStat;
  onToggleFavourite?: () => void;
  compact?: boolean;
}) {
  const canSpeak = speechAvailable();
  return (
    <div className={`ph-card ${compact ? "ph-card-compact" : ""}`}>
      <div className="ph-card-head">
        <p className="ph-ja">{phrase.ja}</p>
        {onToggleFavourite && (
          <button
            className={`ph-star ${stat?.fav ? "on" : ""}`}
            onClick={onToggleFavourite}
            aria-label={stat?.fav ? "お気に入りから外す" : "お気に入りに追加"}
          >
            {stat?.fav ? "★" : "☆"}
          </button>
        )}
      </div>
      <p className="ph-en">{phrase.en}</p>
      <p className="ph-kana">{phrase.kana}</p>
      {canSpeak && (
        <div className="ph-speak-row">
          <button className="ph-speak" onClick={() => speak(phrase.en)}>
            🔊 聞く
          </button>
          <button className="ph-speak" onClick={() => speak(phrase.en, 0.6)}>
            🐢 ゆっくり
          </button>
        </div>
      )}
      {phrase.tip && <p className="ph-tip">💡 {phrase.tip}</p>}
      {phrase.reply && (
        <div className="ph-reply">
          <span className="ph-reply-label">こう返ってくるかも</span>
          <p className="ph-reply-en">
            {phrase.reply}
            {canSpeak && (
              <button
                className="ph-speak ph-speak-inline"
                onClick={() => speak(phrase.reply!)}
                aria-label="返しを聞く"
              >
                🔊
              </button>
            )}
          </p>
          {phrase.replyJa && <p className="ph-reply-ja">{phrase.replyJa}</p>}
        </div>
      )}
    </div>
  );
}
