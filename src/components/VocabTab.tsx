import { useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { useLearners } from "../hooks/useLearners";
import { WORDS, WordGroup, WORD_GROUPS, WORD_TYPE_LABELS } from "../vocab/data";
import { WordSessionOptions } from "../vocab/quiz";
import { countProgress, isDue } from "../study/srs";
import { VocabQuizSession } from "./VocabQuizSession";
import { WordBook } from "./WordBook";
import { Category, LEARNER_IDS, LearnerId } from "../types";
import { daysUntil, todayKey } from "../utils/date";

type View =
  | { mode: "home" }
  | { mode: "book"; group: WordGroup | null }
  | { mode: "quiz"; title: string; options: WordSessionOptions };

/** Places you registered hint at the words you'll actually need. */
const CATEGORY_TO_GROUP: Record<Category, WordGroup> = {
  restaurant: "food",
  museum: "sightseeing",
  sightseeing: "sightseeing",
  shopping: "shopping",
  park: "smalltalk",
  other: "transit",
};

const XP_PER_LEVEL = 100;

const WORD_COUNT = WORDS.filter((w) => w.type === "word").length;
const IDIOM_COUNT = WORDS.filter((w) => w.type === "idiom").length;

/**
 * The study tab: single words and idioms drilled with review boxes, XP and a
 * daily goal, so the deck is learnt by the time the trip starts.
 */
export function VocabTab({ trip }: { trip: TripStore }) {
  const store = useLearners();
  const [view, setView] = useState<View>({ mode: "home" });
  /** Bumped to remount the quiz, which is how a fresh set of questions is drawn. */
  const [round, setRound] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stats = store.me.stats;
  const overall = useMemo(() => countProgress(stats, WORDS), [stats]);
  const dueCount = overall.due;
  const favCount = useMemo(() => WORDS.filter((w) => stats[w.id]?.fav).length, [stats]);
  const answeredToday = store.me.history[todayKey()] ?? 0;
  const goal = store.me.dailyGoal || 10;
  const level = Math.floor(store.me.xp / XP_PER_LEVEL) + 1;
  const levelProgress = store.me.xp % XP_PER_LEVEL;
  const countdown = daysUntil(trip.tripInfo.startDate);

  /** How many new words a day it takes to finish the deck before departure. */
  const pace =
    countdown !== null && countdown > 0
      ? Math.ceil((overall.total - overall.mastered) / countdown)
      : null;

  const suggestions = useMemo(() => {
    const counts = new Map<WordGroup, number>();
    for (const place of trip.places) {
      const group = CATEGORY_TO_GROUP[place.category] ?? "smalltalk";
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([group, count]) => ({ group, count }));
  }, [trip.places]);

  const startQuiz = (title: string, options: WordSessionOptions) => {
    setRound((r) => r + 1);
    setView({ mode: "quiz", title, options });
  };

  if (view.mode === "quiz") {
    return (
      <VocabQuizSession
        key={round}
        store={store}
        title={view.title}
        options={view.options}
        onExit={() => setView({ mode: "home" })}
        onRestart={() => setRound((r) => r + 1)}
      />
    );
  }

  if (view.mode === "book") {
    const group = view.group;
    return (
      <WordBook
        store={store}
        group={group}
        onExit={() => setView({ mode: "home" })}
        onQuiz={() =>
          startQuiz(group ? WORD_GROUPS.find((g) => g.key === group)!.label : "単語帳クイズ", {
            groups: group ? [group] : [],
            count: 10,
          })
        }
      />
    );
  }

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>旅の英単語・英熟語</h2>
        <div className="ph-learner-switch">
          {LEARNER_IDS.map((id: LearnerId) => (
            <button
              key={id}
              className={`ph-learner ${store.learnerId === id ? "on" : ""}`}
              onClick={() => store.chooseLearner(id)}
            >
              {store.learners[id].name}
            </button>
          ))}
        </div>
      </div>

      {store.saveError && <p className="save-error">⚠️ {store.saveError}</p>}

      {store.deviceOnly && (
        <p className="save-error">
          ⚠️ 共有サーバーに接続できないため、学習記録はこの端末にだけ保存しています(学習は続けられます)。設定タブの「動作状況」をご確認ください。
        </p>
      )}

      <div className="ph-hero">
        <div className="ph-hero-top">
          <div>
            <p className="ph-hero-level">レベル {level}</p>
            <p className="ph-hero-xp">{store.me.xp} XP</p>
          </div>
          <div className="ph-hero-badges">
            {store.me.streak > 0 && <span className="ph-badge">🔥 {store.me.streak}日連続</span>}
            {countdown !== null && countdown > 0 && (
              <span className="ph-badge">🗽 出発まで{countdown}日</span>
            )}
          </div>
        </div>
        <div className="ph-bar">
          <span style={{ width: `${levelProgress}%` }} />
        </div>
        <p className="ph-hero-note">次のレベルまで {XP_PER_LEVEL - levelProgress} XP</p>

        <div className="ph-hero-grid">
          <div>
            <span className="ph-stat-num">{overall.mastered}</span>
            <span className="ph-stat-label">習得済み</span>
          </div>
          <div>
            <span className="ph-stat-num">{overall.learning}</span>
            <span className="ph-stat-label">学習中</span>
          </div>
          <div>
            <span className="ph-stat-num">{overall.fresh}</span>
            <span className="ph-stat-label">未学習</span>
          </div>
          <div>
            <span className="ph-stat-num">{overall.total}</span>
            <span className="ph-stat-label">全語数</span>
          </div>
        </div>
      </div>

      <div className="ph-today">
        <div className="ph-today-head">
          <span>今日の学習</span>
          <span className="ph-today-count">
            {answeredToday} / {goal}問
          </span>
        </div>
        <div className="ph-bar">
          <span style={{ width: `${Math.min(100, (answeredToday / goal) * 100)}%` }} />
        </div>
        {pace !== null && (
          <p className="hint ph-pace">
            出発まで残り{countdown}日。1日{pace}語ずつで、出発までに全部覚えきれます。
          </p>
        )}
      </div>

      <button
        className="btn-primary btn-block ph-start"
        onClick={() => startQuiz("今日の単語", { count: goal })}
      >
        ▶ 今日の単語をはじめる({goal}問)
      </button>

      <div className="ph-quick">
        <button
          className="ph-quick-btn"
          disabled={dueCount === 0}
          onClick={() => startQuiz("復習", { count: Math.min(15, dueCount), reviewOnly: true })}
        >
          <span className="ph-quick-icon">🔁</span>
          <span className="ph-quick-label">復習</span>
          <span className="ph-quick-meta">{dueCount}件</span>
        </button>
        <button
          className="ph-quick-btn"
          disabled={favCount === 0}
          onClick={() =>
            startQuiz("お気に入り", { count: Math.min(15, favCount), favouritesOnly: true })
          }
        >
          <span className="ph-quick-icon">★</span>
          <span className="ph-quick-label">お気に入り</span>
          <span className="ph-quick-meta">{favCount}件</span>
        </button>
        <button className="ph-quick-btn" onClick={() => setView({ mode: "book", group: null })}>
          <span className="ph-quick-icon">📘</span>
          <span className="ph-quick-label">単語帳</span>
          <span className="ph-quick-meta">{WORDS.length}語</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <>
          <h3 className="ph-section-title">行き先に合わせたおすすめ</h3>
          <div className="ph-suggest">
            {suggestions.map(({ group, count }) => {
              const meta = WORD_GROUPS.find((g) => g.key === group)!;
              return (
                <button
                  key={group}
                  className="ph-suggest-btn"
                  onClick={() => startQuiz(meta.label, { groups: [group], count: 10 })}
                >
                  <span className="ph-suggest-icon">{meta.icon}</span>
                  <span>
                    <b>{meta.label}</b>
                    <span className="ph-suggest-note">
                      登録した場所に{count}件 — 使う場面がありそうです
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <h3 className="ph-section-title">種類で選ぶ</h3>
      <div className="wd-types">
        <button
          className="wd-type-btn"
          onClick={() => startQuiz(`${WORD_TYPE_LABELS.word}だけ`, { type: "word", count: 10 })}
        >
          <b>単語だけ</b>
          <span>{WORD_COUNT}語 — 名詞・形容詞が中心</span>
        </button>
        <button
          className="wd-type-btn"
          onClick={() => startQuiz(`${WORD_TYPE_LABELS.idiom}だけ`, { type: "idiom", count: 10 })}
        >
          <b>熟語だけ</b>
          <span>{IDIOM_COUNT}語 — check out / to go など</span>
        </button>
      </div>

      <h3 className="ph-section-title">シーンから選ぶ</h3>
      <div className="ph-situations">
        {WORD_GROUPS.map((group) => {
          const pool = WORDS.filter((w) => w.group === group.key);
          const progress = countProgress(stats, pool);
          const due = pool.filter((w) => isDue(stats[w.id])).length;
          const percent = Math.round((progress.mastered / pool.length) * 100);
          return (
            <button
              key={group.key}
              className="ph-situation"
              onClick={() => setView({ mode: "book", group: group.key })}
            >
              <span className="ph-situation-icon">{group.icon}</span>
              <span className="ph-situation-body">
                <span className="ph-situation-title">
                  {group.label}
                  {due > 0 && <span className="ph-due-pill">復習{due}</span>}
                </span>
                <span className="ph-situation-blurb">{group.blurb}</span>
                <span className="ph-bar small">
                  <span style={{ width: `${percent}%` }} />
                </span>
                <span className="ph-situation-meta">
                  習得 {progress.mastered}/{pool.length}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <h3 className="ph-section-title">2人の記録</h3>
      <div className="ph-versus">
        {LEARNER_IDS.map((id) => {
          const learner = store.learners[id];
          const learnerProgress = countProgress(learner.stats, WORDS);
          return (
            <div key={id} className={`ph-versus-card ${store.learnerId === id ? "on" : ""}`}>
              <p className="ph-versus-name">{learner.name}</p>
              <p className="ph-versus-level">Lv.{Math.floor(learner.xp / XP_PER_LEVEL) + 1}</p>
              <p className="ph-versus-meta">{learner.xp} XP</p>
              <p className="ph-versus-meta">習得 {learnerProgress.mastered}語</p>
              <p className="ph-versus-meta">🔥 {learner.streak}日連続</p>
            </div>
          );
        })}
      </div>
      {!store.canShare && (
        <p className="hint">
          Firebaseを設定すると、2人の記録がそれぞれのiPhoneで同期されます(設定タブ参照)。
        </p>
      )}

      <div className="ph-settings">
        <button className="link-button" onClick={() => setSettingsOpen((open) => !open)}>
          {settingsOpen ? "▲ 学習の設定を閉じる" : "▼ 学習の設定"}
        </button>
        {settingsOpen && (
          <div className="settings-form ph-settings-form">
            <label>
              <span className="field-label">表示名({store.me.name})</span>
              <input
                type="text"
                value={store.me.name}
                onChange={(e) => store.rename(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">1日の目標(問)</span>
              <input
                type="number"
                min={5}
                max={50}
                step={5}
                value={goal}
                onChange={(e) => store.setDailyGoal(Number(e.target.value) || 10)}
              />
            </label>
            <button
              className="btn-danger"
              onClick={() => {
                if (confirm(`${store.me.name}の学習記録をすべて消します。よろしいですか?`)) {
                  store.resetProgress();
                }
              }}
            >
              学習記録をリセット
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
