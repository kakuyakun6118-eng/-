import { useMemo, useState } from "react";
import { LearnerStore } from "../hooks/useLearners";
import {
  GROUP_ICONS,
  GROUP_LABELS,
  WORDS,
  WordGroup,
  WordType,
  WORD_TYPE_LABELS,
} from "../vocab/data";
import { isDue, isMastered } from "../study/srs";
import { WordCard } from "./WordCard";
import { speak, speechAvailable } from "../utils/speech";

type Filter = "all" | "fresh" | "review" | "fav" | "mastered";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "fresh", label: "未学習" },
  { key: "review", label: "要復習" },
  { key: "fav", label: "★ お気に入り" },
  { key: "mastered", label: "習得済み" },
];

const TYPES: { key: WordType | "all"; label: string }[] = [
  { key: "all", label: "単語+熟語" },
  { key: "word", label: WORD_TYPE_LABELS.word },
  { key: "idiom", label: WORD_TYPE_LABELS.idiom },
];

/** Browsing mode: read the words, star them, hear them. No scoring. */
export function WordBook({
  store,
  group,
  onQuiz,
  onExit,
}: {
  store: LearnerStore;
  group: WordGroup | null;
  onQuiz: () => void;
  onExit: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [type, setType] = useState<WordType | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return WORDS.filter((entry) => {
      if (group && entry.group !== group) return false;
      if (type !== "all" && entry.type !== type) return false;
      const stat = store.me.stats[entry.id];
      if (filter === "fresh" && stat && stat.last > 0) return false;
      if (filter === "review" && !isDue(stat)) return false;
      if (filter === "fav" && !stat?.fav) return false;
      if (filter === "mastered" && !isMastered(stat)) return false;
      if (
        needle &&
        !`${entry.en} ${entry.ja} ${entry.kana} ${entry.example}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      return true;
    });
  }, [group, type, filter, query, store.me.stats]);

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>{group ? `${GROUP_ICONS[group]} ${GROUP_LABELS[group]}` : "単語帳"}</h2>
        <button className="btn-secondary" onClick={onExit}>
          戻る
        </button>
      </div>

      <button className="btn-primary btn-block ph-book-quiz" onClick={onQuiz}>
        ✏️ {group ? "このシーンで" : ""}クイズに挑戦
      </button>

      <input
        className="ph-search"
        type="search"
        value={query}
        placeholder="英語・日本語で検索"
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="ph-filters">
        {TYPES.map((t) => (
          <button
            key={t.key}
            className={`ph-filter ${type === t.key ? "on" : ""}`}
            onClick={() => setType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

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

      {entries.length === 0 && <p className="empty-state">該当する単語がありません。</p>}

      <ul className="ph-list">
        {entries.map((entry) => {
          const stat = store.me.stats[entry.id];
          const open = openId === entry.id;
          const state = isMastered(stat)
            ? "mastered"
            : isDue(stat)
              ? "due"
              : stat && stat.last > 0
                ? "learning"
                : "fresh";
          return (
            <li key={entry.id} className={`ph-row ${open ? "open" : ""}`}>
              <div className="ph-row-head">
                <button className="ph-row-main" onClick={() => setOpenId(open ? null : entry.id)}>
                  <span className={`ph-dot ${state}`} aria-hidden="true" />
                  <span className="ph-row-text">
                    <span className="ph-row-ja wd-row-en">{entry.en}</span>
                    <span className="ph-row-en wd-row-ja">{entry.ja}</span>
                  </span>
                  {entry.type === "idiom" && <span className="wd-row-tag">熟</span>}
                  {stat?.fav && <span className="ph-row-star">★</span>}
                </button>
                {speechAvailable() && (
                  <button
                    className="ph-row-speak"
                    aria-label="読み上げ"
                    onClick={() => speak(entry.en)}
                  >
                    🔊
                  </button>
                )}
              </div>
              {open && (
                <WordCard
                  entry={entry}
                  stat={stat}
                  onToggleFavourite={() => store.toggleFavourite(entry.id)}
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
