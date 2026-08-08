import Link from "next/link";
import { loadRecommendations } from "@/lib/recommendations";
import DataIssueBanner from "./DataIssueBanner";
import { recentIssues } from "@/lib/dataHealth";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<string, string> = {
  positive: "追い風あり",
  negative: "逆風あり",
  neutral: "中立",
};

const THEORY_LABEL: Record<string, string> = {
  strong: "有力",
  watch: "注目",
  neutral: "中立",
  caution: "警戒",
};

export default async function Home() {
  const recommendations = await loadRecommendations();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>今日のおすすめ銘柄</h1>
        <nav className={styles.nav}>
          <Link href="/watch">注目アカウントの投稿 →</Link>
          <Link href="/holdings">保有株の売り時判定へ →</Link>
          <Link href="/history">判定履歴 →</Link>
          <Link href="/settings">設定 →</Link>
        </nav>
      </header>

      <DataIssueBanner issues={recentIssues()} />

      {!hasApiKey && (
        <p className={styles.warning}>
          ANTHROPIC_API_KEY が未設定のため、ニュース影響度の判定はスキップされ「中立」表示になっています。.env.local を設定してください。
        </p>
      )}

      <p className={styles.disclaimer}>
        本アプリの表示はニュース要約とルールベース・LLMによる参考情報であり、投資助言ではありません。売買判断はご自身の責任で行ってください。
        監視アカウントの言及があった銘柄は、その紫蘇の葉理論スコアも判定に含めています。
      </p>

      <ul className={styles.list}>
        {recommendations.map((rec) => (
          <li key={rec.ticker} className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.ticker}>{rec.ticker}</span>
              <span className={styles.name}>{rec.name}</span>
              <span className={`${styles.badge} ${styles[rec.verdict]}`}>{VERDICT_LABEL[rec.verdict]}</span>
            </div>

            <div className={styles.metrics}>
              <span>現在値 {rec.quote.price.toLocaleString()} 円</span>
              <span>前日比 {rec.quote.changePercent.toFixed(2)}%</span>
              <span>総合スコア {rec.combinedScore}</span>
            </div>

            {rec.theory && (
              <p className={styles.theory}>
                <Link href="/watch" className={styles.theoryLink}>
                  監視アカウントが言及
                </Link>
                <span className={`${styles.theoryBadge} ${styles[rec.theory.verdict]}`}>{THEORY_LABEL[rec.theory.verdict]}</span>
                <span className={styles.theoryTotal}>
                  紫蘇の葉理論 {rec.theory.total > 0 ? `+${rec.theory.total}` : rec.theory.total}点
                </span>
              </p>
            )}

            {rec.cautions.map((caution) => (
              <p key={caution} className={styles.caution}>
                ⚠ {caution}
              </p>
            ))}

            <p className={styles.reasoning}>{rec.impact.reasoning}</p>

            {rec.impact.basedOn.length > 0 && (
              <ul className={styles.headlines}>
                {rec.impact.basedOn.slice(0, 3).map((h) => (
                  <li key={h.link}>
                    <a href={h.link} target="_blank" rel="noreferrer">
                      {h.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
