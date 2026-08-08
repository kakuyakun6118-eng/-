import Link from "next/link";
import { loadAccountActivity } from "@/lib/accountActivity";
import styles from "./watch.module.css";

export const dynamic = "force-dynamic";

const VERDICT_LABEL: Record<string, string> = {
  positive: "追い風あり",
  negative: "逆風あり",
  neutral: "中立",
};

export default async function WatchPage() {
  const activity = await loadAccountActivity();
  const hasToken = !!process.env.X_BEARER_TOKEN;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1>注目アカウントの投稿</h1>
        <Link href="/">← 今日のおすすめへ</Link>
      </header>

      {!hasToken && (
        <p className={styles.warning}>
          X_BEARER_TOKEN が未設定のため投稿を取得できません。.env.local に X API の Bearer Token を設定してください。
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

          {account.mentions.length > 0 && (
            <ul className={styles.mentions}>
              {account.mentions.map((m) => (
                <li key={m.ticker} className={styles.mention}>
                  <span className={styles.ticker}>{m.ticker}</span>
                  <span className={`${styles.badge} ${styles[m.impact.verdict]}`}>{VERDICT_LABEL[m.impact.verdict]}</span>
                  <p className={styles.reasoning}>{m.impact.reasoning}</p>
                </li>
              ))}
            </ul>
          )}

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
        </section>
      ))}
    </main>
  );
}
