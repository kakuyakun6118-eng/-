import Link from "next/link";
import { isAuthEnabled } from "@/lib/auth";
import LoginForm from "./LoginForm";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!isAuthEnabled()) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>ログインは不要です</h1>
        <p className={styles.note}>
          <code>APP_PASSWORD</code> が設定されていないため、認証は無効です。インターネットに公開する場合は必ず設定してください。
        </p>
        <Link href="/" className={styles.link}>
          トップへ
        </Link>
      </main>
    );
  }

  return <LoginForm />;
}
