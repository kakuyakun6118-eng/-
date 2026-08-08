import Link from "next/link";
import { getWatchlist } from "@/lib/watchlist";
import { getQuote } from "@/lib/prices";
import { getHeadlines } from "@/lib/news";
import { judgeImpact } from "@/lib/llm";
import { buildRecommendation, rankRecommendations } from "@/lib/scoring";
import type { Recommendation } from "@/lib/types";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function loadRecommendations(): Promise<Recommendation[]> {
  const watchlist = await getWatchlist();
  const recs = await Promise.all(
    watchlist.map(async (entry) => {
      const quote = await getQuote(entry.ticker);
      if (!quote) return null;
      const headlines = await getHeadlines(entry.ticker, entry.name);
      const impact = await judgeImpact(entry.ticker, entry.name, headlines);
      return buildRecommendation(entry.ticker, entry.name, quote, impact);
    })
  );
  return rankRecommendations(recs.filter((r): r is Recommendation => r !== null));
}

const VERDICT_LABEL: Record<string, string> = {
  positive: "追い風あり",
  negative: "逆風あり",
  neutral: "中立",
};

export default async function Home() {
  const recommendations = await loadRecommendations();
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>今日のおすすめ銘柄(ウォッチリスト)</h1>
        <nav className={styles.nav}>
          <Link href="/watch">注目アカウントの投稿 →</Link>
          <Link href="/holdings">保有株の売り時判定へ →</Link>
        </nav>
      </header>

      {!hasApiKey && (
        <p className={styles.warning}>
          ANTHROPIC_API_KEY が未設定のため、ニュース影響度の判定はスキップされ「中立」表示になっています。.env.local を設定してください。
        </p>
      )}

      <p className={styles.disclaimer}>
        本アプリの表示はニュース要約とルールベース・LLMによる参考情報であり、投資助言ではありません。売買判断はご自身の責任で行ってください。
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
