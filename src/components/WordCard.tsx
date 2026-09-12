import { WordEntry, WORD_TYPE_LABELS } from "../vocab/data";
import { CardStat } from "../study/srs";
import { speak, speechAvailable } from "../utils/speech";

/**
 * One vocabulary entry, expanded: the word, how it sounds, what it means and
 * a sentence you could really hear in New York. Shared by the word book and
 * the answer reveal in a quiz.
 */
export function WordCard({
  entry,
  stat,
  onToggleFavourite,
  compact = false,
}: {
  entry: WordEntry;
  stat?: CardStat;
  onToggleFavourite?: () => void;
  compact?: boolean;
}) {
  const canSpeak = speechAvailable();
  return (
    <div className={`ph-card wd-card ${compact ? "ph-card-compact" : ""}`}>
      <div className="ph-card-head">
        <div>
          <p className="wd-en">{entry.en}</p>
          <p className="ph-kana">{entry.kana}</p>
        </div>
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

      <div className="wd-tags">
        <span className={`wd-tag ${entry.type}`}>{WORD_TYPE_LABELS[entry.type]}</span>
        {/* 熟語 entries carry "熟語" as their part of speech too — don't say it twice. */}
        {entry.pos !== WORD_TYPE_LABELS[entry.type] && (
          <span className="wd-tag pos">{entry.pos}</span>
        )}
      </div>

      <p className="wd-ja">{entry.ja}</p>

      {canSpeak && (
        <div className="ph-speak-row">
          <button className="ph-speak" onClick={() => speak(entry.en)}>
            🔊 聞く
          </button>
          <button className="ph-speak" onClick={() => speak(entry.example, 0.85)}>
            🗣 例文を聞く
          </button>
        </div>
      )}

      <div className="wd-example">
        <span className="wd-example-label">例文</span>
        <p className="wd-example-en">{entry.example}</p>
        <p className="wd-example-ja">{entry.exampleJa}</p>
      </div>

      {entry.note && <p className="ph-tip">💡 {entry.note}</p>}
    </div>
  );
}
