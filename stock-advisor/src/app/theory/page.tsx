import Link from "next/link";
import { loadCoverage } from "@/lib/theoryService";
import { POINTS } from "@/lib/theory";
import DataIssueBanner from "../DataIssueBanner";
import { recentIssues } from "@/lib/dataHealth";
import type { TheoryScore } from "@/lib/types";
import styles from "./theory.module.css";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<TheoryScore["verdict"], string> = {
  strong: "有力",
  watch: "注目",
  neutral: "中立",
  caution: "警戒",
};

function RuleRow({ label, points, applies, detail }: { label: string; points: number; applies: boolean; detail: string }) {
  return (
    <li className={`${styles.rule} ${applies ? styles.ruleOn : styles.ruleOff}`}>
      <span className={styles.ruleMark} aria-hidden="true">
        {applies ? "●" : "○"}
      </span>
      <span className={styles.ruleLabel}>{label}</span>
      <span className={styles.rulePoints}>{applies ? `${points > 0 ? "+" : ""}${points}` : "0"}</span>
      <p className={styles.ruleDetail}>{detail}</p>
    </li>
  );
}

export default async function TheoryPage() {
  const coverage = await loadCoverage();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>紫蘇の葉理論スコア</h1>
        <nav className={styles.nav}>
          <Link href="/">← 今日のおすすめへ</Link>
          <Link href="/history">判定履歴 →</Link>
          <Link href="/settings">設定 →</Link>
        </nav>
      </header>

      <DataIssueBanner issues={recentIssues()} />

      {!hasApiKey && (
        <p className={styles.warning}>
          ANTHROPIC_API_KEY が未設定のため、ポジティブ感・リスクの判定はスキップされます(話題性の急上昇のみ集計されます)。
        </p>
      )}

      <p className={styles.disclaimer}>
        ウォッチリストと保有株の各銘柄を、3つのルールの合計点(-30〜+70)で評価しています。ルール1(話題性)はニュース記事数の実測、
        ルール2・3はLLMによる記事内容の解釈です。参考情報であり投資助言ではありません。
      </p>

      {coverage.length === 0 && <p className={styles.empty}>対象銘柄がありません。設定からウォッチリストに追加してください。</p>}

      <ul className={styles.scorecards}>
        {coverage.map(({ ticker, name, score, feed }) => (
          <li key={ticker} className={styles.scorecard}>
            <div className={styles.scoreHeader}>
              <span className={styles.ticker}>{ticker}</span>
              {name && <span className={styles.handle}>{name}</span>}
              <span className={`${styles.badge} ${styles[score.verdict]}`}>{VERDICT_LABEL[score.verdict]}</span>
              <span className={styles.total}>{score.total > 0 ? `+${score.total}` : score.total}点</span>
            </div>

            <ul className={styles.rules}>
              <RuleRow label="話題性の急上昇" points={POINTS.buzzSurge} applies={score.buzz.applies} detail={score.buzz.detail} />
              <RuleRow
                label={`ポジティブ感${score.catalyst.type ? `(${score.catalyst.type})` : ""}`}
                points={POINTS.positiveCatalyst}
                applies={score.catalyst.applies}
                detail={score.catalyst.applies ? "具体的な好材料に基づく報道と判定されました。" : "具体的な好材料は確認できませんでした。"}
              />
              <RuleRow
                label={`リスク${score.risk.type ? `(${score.risk.type})` : ""}`}
                points={POINTS.risk}
                applies={score.risk.applies}
                detail={score.risk.applies ? "減点要素が検出されました。" : "減点要素は検出されませんでした。"}
              />
            </ul>

            <p className={styles.reasoning}>{score.reasoning}</p>

            {feed.length > 0 && (
              <details className={styles.postsToggle}>
                <summary>取得した記事({feed.length}件)</summary>
                <ul className={styles.posts}>
                  {feed.slice(0, 15).map((item) => (
                    <li key={item.link} className={styles.post}>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      <div className={styles.postMeta}>
                        <span>{item.pubDate ? new Date(item.pubDate).toLocaleString("ja-JP") : "日時不明"}</span>
                        <span>{item.source}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
