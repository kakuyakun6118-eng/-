import Link from "next/link";
import { loadAccountActivity } from "@/lib/accountActivity";
import { POINTS } from "@/lib/theory";
import type { TheoryScore } from "@/lib/types";
import styles from "./watch.module.css";

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

function Scorecard({ score }: { score: TheoryScore }) {
  return (
    <li className={styles.scorecard}>
      <div className={styles.scoreHeader}>
        <span className={styles.ticker}>{score.ticker}</span>
        <span className={`${styles.badge} ${styles[score.verdict]}`}>{VERDICT_LABEL[score.verdict]}</span>
        <span className={styles.total}>{score.total > 0 ? `+${score.total}` : score.total}点</span>
      </div>

      <ul className={styles.rules}>
        <RuleRow label="話題性の急上昇" points={POINTS.buzzSurge} applies={score.buzz.applies} detail={score.buzz.detail} />
        <RuleRow
          label={`ポジティブ感${score.catalyst.type ? `(${score.catalyst.type})` : ""}`}
          points={POINTS.positiveCatalyst}
          applies={score.catalyst.applies}
          detail={score.catalyst.applies ? "具体的な好材料に基づく言及と判定されました。" : "具体的な好材料は確認できませんでした。"}
        />
        <RuleRow
          label={`リスク${score.risk.type ? `(${score.risk.type})` : ""}`}
          points={POINTS.risk}
          applies={score.risk.applies}
          detail={score.risk.applies ? "減点要素が検出されました。" : "減点要素は検出されませんでした。"}
        />
      </ul>

      <p className={styles.reasoning}>{score.reasoning}</p>
    </li>
  );
}

export default async function WatchPage() {
  const activity = await loadAccountActivity();
  const hasToken = !!process.env.X_BEARER_TOKEN;
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>注目アカウントの投稿(紫蘇の葉理論スコア)</h1>
        <Link href="/">← 今日のおすすめへ</Link>
      </header>

      {!hasToken && (
        <p className={styles.warning}>
          X_BEARER_TOKEN が未設定のため投稿を取得できません。.env.local に X API の Bearer Token を設定してください。
        </p>
      )}
      {hasToken && !hasApiKey && (
        <p className={styles.warning}>
          ANTHROPIC_API_KEY が未設定のため、ポジティブ感・リスクの判定はスキップされます(話題性の急上昇のみ集計されます)。
        </p>
      )}

      <p className={styles.disclaimer}>
        以下は監視対象アカウント(<code>data/watchedAccounts.json</code>)本人の公開投稿をそのまま引用しています。
        当アプリが本人になりすまして生成した発言ではありません。特定個人の投稿・銘柄選定に追随した売買は、
        値動きが本人都合(利確・撤退など)で急変するリスクがあるため、投資判断は必ずご自身の責任で行ってください。
      </p>

      {activity.map((account) => (
        <section key={account.handle} className={styles.account}>
          <h2>
            {account.label ?? account.handle}
            <span className={styles.handle}> @{account.handle}</span>
          </h2>

          {account.scores.length > 0 ? (
            <ul className={styles.scorecards}>
              {account.scores.map((score) => (
                <Scorecard key={score.ticker} score={score} />
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>スコア対象となる銘柄への言及は見つかりませんでした。</p>
          )}

          <details className={styles.postsToggle}>
            <summary>取得した投稿({account.posts.length}件)</summary>
            <ul className={styles.posts}>
              {account.posts.map((p) => (
                <li key={p.id} className={styles.post}>
                  <p>{p.text}</p>
                  <div className={styles.postMeta}>
                    <span>{new Date(p.createdAt).toLocaleString("ja-JP")}</span>
                    <a href={p.url} target="_blank" rel="noreferrer">
                      元投稿を見る
                    </a>
                  </div>
                </li>
              ))}
              {account.posts.length === 0 && <li className={styles.empty}>投稿が見つかりませんでした。</li>}
            </ul>
          </details>
        </section>
      ))}
    </main>
  );
}
