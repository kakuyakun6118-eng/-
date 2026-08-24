import { useMemo, useState } from "react";
import { LearnerStore } from "../hooks/useLearners";
import { PHRASES, Situation, SITUATION_ICONS, SITUATION_LABELS } from "../phrases/data";
import { isDue, isMastered } from "../phrases/quiz";
import { PhraseCard } from "./PhraseCard";
import { speak, speechAvailable } from "../utils/speech";

type Filter = "all" | "fresh" | "review" | "fav" | "mastered";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "fresh", label: "未学習" },
  { key: "review", label: "要復習" },
  { key: "fav", label: "★ お気に入り" },
  { key: "mastered", label: "習得済み" },
];

/** Browsing mode: read the phrases, star them, hear them. No scoring. */
export function PhraseBook({
  store,
  situation,
  onQuiz,
  onExit,
}: {
  store: LearnerStore;
  situation: Situation | null;
  onQuiz: () => void;
  onExit: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const phrases = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PHRASES.filter((phrase) => {
      if (situation && phrase.situation !== situation) return false;
      const stat = store.me.stats[phrase.id];
      if (filter === "fresh" && stat && stat.last > 0) return false;
      if (filter === "review" && !isDue(stat)) return false;
      if (filter === "fav" && !stat?.fav) return false;
      if (filter === "mastered" && !isMastered(stat)) return false;
      if (needle && !`${phrase.ja} ${phrase.en} ${phrase.kana}`.toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [situation, filter, query, store.me.stats]);

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>
          {situation ? `${SITUATION_ICONS[situation]} ${SITUATION_LABELS[situation]}` : "フレーズ帳"}
        </h2>
        <button className="btn-secondary" onClick={onExit}>
          戻る
        </button>
      </div>

      <button className="btn-primary btn-block ph-book-quiz" onClick={onQuiz}>
        ✏️ {situation ? "このシーンで" : ""}クイズに挑戦
      </button>

      <input
        className="ph-search"
        type="search"
        value={query}
        placeholder="日本語・英語で検索"
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="ph-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`ph-filter ${filter === f.key ? "on" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {phrases.length === 0 && <p className="empty-state">該当するフレーズがありません。</p>}

      <ul className="ph-list">
        {phrases.map((phrase) => {
          const stat = store.me.stats[phrase.id];
          const open = openId === phrase.id;
          const state = isMastered(stat)
            ? "mastered"
            : isDue(stat)
              ? "due"
              : stat && stat.last > 0
                ? "learning"
                : "fresh";
          return (
            <li key={phrase.id} className={`ph-row ${open ? "open" : ""}`}>
              <div className="ph-row-head">
                <button
                  className="ph-row-main"
                  onClick={() => setOpenId(open ? null : phrase.id)}
                >
                  <span className={`ph-dot ${state}`} aria-hidden="true" />
                  <span className="ph-row-text">
                    <span className="ph-row-ja">{phrase.ja}</span>
                    <span className="ph-row-en">{phrase.en}</span>
                  </span>
                  {stat?.fav && <span className="ph-row-star">★</span>}
                </button>
                {speechAvailable() && (
                  <button
                    className="ph-row-speak"
                    aria-label="読み上げ"
                    onClick={() => speak(phrase.en)}
                  >
                    🔊
                  </button>
                )}
              </div>
              {open && (
                <PhraseCard
                  phrase={phrase}
                  stat={stat}
                  onToggleFavourite={() => store.toggleFavourite(phrase.id)}
                  compact
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
