import { useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { useLearners } from "../hooks/useLearners";
import { PHRASES, Situation, SITUATIONS } from "../phrases/data";
import { countProgress, isDue, SessionOptions } from "../phrases/quiz";
import { QuizSession } from "./QuizSession";
import { PhraseBook } from "./PhraseBook";
import { Category, LEARNER_IDS, LearnerId } from "../types";
import { daysUntil, todayKey } from "../utils/date";

type View =
  | { mode: "home" }
  | { mode: "book"; situation: Situation | null }
  | { mode: "quiz"; title: string; options: SessionOptions };

/** Places you registered hint at the phrases you'll actually need. */
const CATEGORY_TO_SITUATION: Record<Category, Situation> = {
  restaurant: "restaurant",
  museum: "sightseeing",
  sightseeing: "sightseeing",
  shopping: "shopping",
  park: "smalltalk",
  other: "transit",
};

const XP_PER_LEVEL = 100;

export function PhrasesTab({ trip }: { trip: TripStore }) {
  const store = useLearners();
  const [view, setView] = useState<View>({ mode: "home" });
  /** Bumped to remount the quiz, which is how a fresh set of questions is drawn. */
  const [round, setRound] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const stats = store.me.stats;
  const overall = useMemo(() => countProgress(stats), [stats]);
  const dueCount = overall.due;
  const favCount = useMemo(
    () => PHRASES.filter((p) => stats[p.id]?.fav).length,
    [stats],
  );
  const answeredToday = store.me.history[todayKey()] ?? 0;
  const goal = store.me.dailyGoal || 10;
  const level = Math.floor(store.me.xp / XP_PER_LEVEL) + 1;
  const levelProgress = store.me.xp % XP_PER_LEVEL;
  const countdown = daysUntil(trip.tripInfo.startDate);

  /** How many new phrases a day it takes to finish the deck before departure. */
  const pace =
    countdown !== null && countdown > 0
      ? Math.ceil((overall.total - overall.mastered) / countdown)
      : null;

  const suggestions = useMemo(() => {
    const counts = new Map<Situation, number>();
    for (const place of trip.places) {
      const situation = CATEGORY_TO_SITUATION[place.category] ?? "smalltalk";
      counts.set(situation, (counts.get(situation) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([situation, count]) => ({ situation, count }));
  }, [trip.places]);

  const startQuiz = (title: string, options: SessionOptions) => {
    setRound((r) => r + 1);
    setView({ mode: "quiz", title, options });
  };

  if (view.mode === "quiz") {
    return (
      <QuizSession
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
    const situation = view.situation;
    return (
      <PhraseBook
        store={store}
        situation={situation}
        onExit={() => setView({ mode: "home" })}
        onQuiz={() =>
          startQuiz(
            situation ? SITUATIONS.find((s) => s.key === situation)!.label : "フレーズ帳クイズ",
            { situations: situation ? [situation] : [], count: 10 },
          )
        }
      />
    );
  }

  return (
    <div className="tab-content">
      <div className="tab-header-row">
        <h2>旅の英会話</h2>
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
        <p className="ph-hero-note">
          次のレベルまで {XP_PER_LEVEL - levelProgress} XP
        </p>

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
            <span className="ph-stat-label">全フレーズ</span>
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
            出発まで残り{countdown}日。1日{pace}フレーズ覚えれば、全部持っていけます。
          </p>
        )}
      </div>

      <button
        className="btn-primary btn-block ph-start"
        onClick={() => startQuiz("今日の学習", { count: goal })}
      >
        ▶ 今日の学習をはじめる({goal}問)
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
        <button className="ph-quick-btn" onClick={() => setView({ mode: "book", situation: null })}>
          <span className="ph-quick-icon">📕</span>
          <span className="ph-quick-label">フレーズ帳</span>
          <span className="ph-quick-meta">{PHRASES.length}件</span>
        </button>
      </div>

      {suggestions.length > 0 && (
        <>
          <h3 className="ph-section-title">行き先に合わせたおすすめ</h3>
          <div className="ph-suggest">
            {suggestions.map(({ situation, count }) => {
              const meta = SITUATIONS.find((s) => s.key === situation)!;
              return (
                <button
                  key={situation}
                  className="ph-suggest-btn"
                  onClick={() => startQuiz(meta.label, { situations: [situation], count: 10 })}
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

      <h3 className="ph-section-title">シーンから選ぶ</h3>
      <div className="ph-situations">
        {SITUATIONS.map((situation) => {
          const pool = PHRASES.filter((p) => p.situation === situation.key);
          const progress = countProgress(stats, pool);
          const due = pool.filter((p) => isDue(stats[p.id])).length;
          const percent = Math.round((progress.mastered / pool.length) * 100);
          return (
            <button
              key={situation.key}
              className="ph-situation"
              onClick={() => setView({ mode: "book", situation: situation.key })}
            >
              <span className="ph-situation-icon">{situation.icon}</span>
              <span className="ph-situation-body">
                <span className="ph-situation-title">
                  {situation.label}
                  {due > 0 && <span className="ph-due-pill">復習{due}</span>}
                </span>
                <span className="ph-situation-blurb">{situation.blurb}</span>
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
          const learnerProgress = countProgress(learner.stats);
          return (
            <div key={id} className={`ph-versus-card ${store.learnerId === id ? "on" : ""}`}>
              <p className="ph-versus-name">{learner.name}</p>
              <p className="ph-versus-level">Lv.{Math.floor(learner.xp / XP_PER_LEVEL) + 1}</p>
              <p className="ph-versus-meta">{learner.xp} XP</p>
              <p className="ph-versus-meta">習得 {learnerProgress.mastered}フレーズ</p>
              <p className="ph-versus-meta">🔥 {learner.streak}日連続</p>
            </div>
          );
        })}
      </div>
      {!store.isShared && (
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
