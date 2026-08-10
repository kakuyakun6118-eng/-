import { useMemo, useState } from "react";
import { TripStore } from "../hooks/useTrip";
import { DEFAULT_PLAN_OPTIONS, PlanOptions } from "../types";
import { autoSchedule, PlanResult } from "../scheduler/autoSchedule";
import { CROWD_LABELS } from "../scheduler/nycKnowledge";
import { formatDateLabel } from "../utils/date";
import { Scene, sceneForIndex } from "./Scene";

export function CrowdBadge({ level }: { level: number }) {
  return (
    <span className={`crowd-badge crowd-${level}`} title={`混雑予測: ${CROWD_LABELS[level]}`}>
      {"●".repeat(level)}
      <span className="crowd-text">{CROWD_LABELS[level]}</span>
    </span>
  );
}

export function AutoPlanTab({ trip }: { trip: TripStore }) {
  const [options, setOptions] = useState<PlanOptions>(DEFAULT_PLAN_OPTIONS);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const set = <K extends keyof PlanOptions>(key: K, value: PlanOptions[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const byDate = useMemo(() => {
    if (!result) return [];
    const map = new Map<string, typeof result.items>();
    for (const item of result.items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [result]);

  const generate = () => {
    setApplied(false);
    setResult(autoSchedule(trip.places, trip.tripInfo, options));
  };

  const apply = async () => {
    if (!result) return;
    setApplying(true);
    try {
      // Replace previous auto-generated items; anything added by hand stays.
      const stale = trip.scheduleItems.filter((i) => i.auto);
      await Promise.all(stale.map((i) => trip.removeScheduleItem(i.id)));
      for (const item of result.items) {
        await trip.addScheduleItem(item);
      }
      setApplied(true);
    } finally {
      setApplying(false);
    }
  };

  const manualCount = trip.scheduleItems.filter((i) => !i.auto).length;

  return (
    <div className="tab-content">
      <div className="hero hero-small">
        <Scene scene="skyline" />
        <div className="hero-overlay">
          <h2>AIおまかせプラン</h2>
          <p>登録した場所から、曜日と時間帯の混みやすさを考えて日程を組みます</p>
        </div>
      </div>

      <div className="disclaimer">
        混雑・空き状況の<strong>リアルタイムデータは取得していません</strong>。曜日・時間帯・場所の
        タイプから統計的に推定した目安です。休館日や予約可否は必ず公式サイトでご確認ください。
      </div>

      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <div className="form-row">
          <label>
            1日の開始
            <input type="time" value={options.dayStart} onChange={(e) => set("dayStart", e.target.value)} />
          </label>
          <label>
            1日の終了
            <input type="time" value={options.dayEnd} onChange={(e) => set("dayEnd", e.target.value)} />
          </label>
        </div>

        <label>
          1日に回る場所の数(最大)
          <select value={options.maxPerDay} onChange={(e) => set("maxPerDay", Number(e.target.value))}>
            <option value={2}>2件(ゆったり)</option>
            <option value={3}>3件(標準)</option>
            <option value={4}>4件(しっかり)</option>
            <option value={5}>5件(かなり詰める)</option>
          </select>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.clusterByArea}
            onChange={(e) => set("clusterByArea", e.target.checked)}
          />
          同じエリアをまとめて移動を減らす
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.avoidCrowds}
            onChange={(e) => set("avoidCrowds", e.target.checked)}
          />
          混みやすい時間帯を避ける
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={options.includeIfTime}
            onChange={(e) => set("includeIfTime", e.target.checked)}
          />
          「時間があれば」の場所も入れる
        </label>

        <button type="submit" className="btn-primary btn-block" disabled={trip.places.length === 0}>
          ✨ プランを作成
        </button>
        {trip.places.length === 0 && (
          <p className="empty-state">先に「行きたい場所」を登録してください。</p>
        )}
      </form>

      {result && (
        <>
          <div className="tab-header-row">
            <h3>プラン案</h3>
            <button className="btn-primary" onClick={apply} disabled={applying || result.items.length === 0}>
              {applying ? "反映中..." : applied ? "反映しました ✓" : "この内容で確定"}
            </button>
          </div>
          {manualCount > 0 && (
            <p className="hint">
              手動で追加した{manualCount}件の予定はそのまま残ります(自動作成分だけ置き換えます)。
            </p>
          )}

          {byDate.length === 0 && (
            <p className="empty-state">
              条件に合う予定を作れませんでした。1日の件数や時間帯を広げてみてください。
            </p>
          )}

          {byDate.map(([date, items], index) => (
            <section key={date} className="plan-day">
              <div className="plan-day-banner">
                <Scene scene={sceneForIndex(index)} />
                <span className="plan-day-label">{formatDateLabel(date)}</span>
              </div>
              <ol className="plan-list">
                {items.map((item, i) => (
                  <li key={i} className="plan-item">
                    <span className="plan-time">{item.time}</span>
                    <span className="plan-body">
                      <strong>{item.title}</strong>
                      {item.duration && <span className="duration-tag">{item.duration}分</span>}
                      {item.crowdLevel && <CrowdBadge level={item.crowdLevel} />}
                      {item.note && <p className="schedule-item-note">{item.note}</p>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          {result.unplaced.length > 0 && (
            <section className="plan-warnings">
              <h4>入りきらなかった場所</h4>
              {result.unplaced.map((u) => (
                <p key={u.place.id} className="warn-line">
                  <strong>{u.place.name}</strong>: {u.reason}
                </p>
              ))}
            </section>
          )}

          {result.warnings.length > 0 && (
            <section className="plan-warnings">
              <h4>注意点</h4>
              {result.warnings.map((w, i) => (
                <p key={i} className={`warn-line ${w.level}`}>
                  {w.verify && <span className="verify-tag">要確認</span>}
                  {w.message}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
