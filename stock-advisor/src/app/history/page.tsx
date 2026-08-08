import Link from "next/link";
import { loadHistoryView } from "@/lib/historyService";
import { MIN_HISTORY_DAYS } from "@/lib/history";
import DataIssueBanner from "../DataIssueBanner";
import { recentIssues } from "@/lib/dataHealth";
import RecordButton from "./RecordButton";
import styles from "./history.module.css";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<string, string> = {
  strong: "有力",
  watch: "注目",
  neutral: "中立",
  caution: "警戒",
};

function pct(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export default async function HistoryPage() {
  const { outcomes, stats } = await loadHistoryView();
  const recordedDays = new Set(outcomes.map((o) => o.date)).size;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>判定履歴と答え合わせ</h1>
        <nav className={styles.nav}>
          <Link href="/">← 今日のおすすめへ</Link>
          <Link href="/watch">注目アカウントの投稿 →</Link>
          <Link href="/settings">設定 →</Link>
        </nav>
      </header>

      <DataIssueBanner issues={recentIssues()} />

      <p className={styles.disclaimer}>
        過去の判定を、その時点の株価と現在値で比較したものです。サンプル数が少ないうちの勝率は偶然に大きく左右されるため、
        傾向として参照するに留めてください。過去の結果は将来の成績を保証しません。
      </p>

      <div className={styles.recordRow}>
        <RecordButton />
        <span className={styles.recordNote}>
          記録済み: {recordedDays}日分 / {outcomes.length}件
          {recordedDays < MIN_HISTORY_DAYS && `(話題性の基準値に使うには${MIN_HISTORY_DAYS}日分以上が必要です)`}
        </span>
      </div>

      <section className={styles.section}>
        <h2>判定区分ごとの成績</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>判定</th>
                <th>件数</th>
                <th>上昇率</th>
                <th>平均リターン</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.verdict}>
                  <td>
                    <span className={`${styles.badge} ${styles[s.verdict]}`}>{VERDICT_LABEL[s.verdict]}</span>
                  </td>
                  <td className={styles.num}>{s.count}</td>
                  <td className={styles.num}>{s.hitRate === null ? "—" : `${(s.hitRate * 100).toFixed(0)}%`}</td>
                  <td className={`${styles.num} ${s.averageReturnPercent !== null && s.averageReturnPercent < 0 ? styles.negative : ""}`}>
                    {pct(s.averageReturnPercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2>個別の判定</h2>
        {outcomes.length === 0 ? (
          <p className={styles.empty}>まだ記録がありません。「今日の判定を記録」を押すか、日次でcronを設定してください。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>銘柄</th>
                  <th>判定</th>
                  <th>点数</th>
                  <th>判定時</th>
                  <th>現在</th>
                  <th>騰落</th>
                  <th>経過</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o) => (
                  <tr key={`${o.date}-${o.ticker}`}>
                    <td>{o.date}</td>
                    <td>
                      <span className={styles.ticker}>{o.ticker}</span>
                      {o.name && <span className={styles.name}>{o.name}</span>}
                      {o.riskType && <span className={styles.riskTag}>{o.riskType}</span>}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[o.theoryVerdict]}`}>{VERDICT_LABEL[o.theoryVerdict]}</span>
                    </td>
                    <td className={styles.num}>{o.theoryTotal > 0 ? `+${o.theoryTotal}` : o.theoryTotal}</td>
                    <td className={styles.num}>{o.price?.toLocaleString() ?? "—"}</td>
                    <td className={styles.num}>{o.currentPrice?.toLocaleString() ?? "—"}</td>
                    <td className={`${styles.num} ${o.returnPercent !== null && o.returnPercent < 0 ? styles.negative : ""}`}>{pct(o.returnPercent)}</td>
                    <td className={styles.num}>{o.daysElapsed}日</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
