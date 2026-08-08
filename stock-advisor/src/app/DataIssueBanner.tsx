import { describeIssue, type DataIssue } from "@/lib/dataHealth";
import styles from "./DataIssueBanner.module.css";

/**
 * Presentational, so both server pages (which read `recentIssues()` directly)
 * and the client-side holdings view (which gets issues back from its API call)
 * can render the same banner. Without it an outage looks like a quiet day.
 */
export default function DataIssueBanner({ issues }: { issues: DataIssue[] }) {
  if (issues.length === 0) return null;

  return (
    <div className={styles.banner} role="status">
      <strong className={styles.heading}>データ取得に問題があります</strong>
      <ul className={styles.list}>
        {issues.map((issue) => (
          <li key={issue.source}>{describeIssue(issue)}</li>
        ))}
      </ul>
      <p className={styles.note}>表示が空・不完全なのは材料がないためではなく、上記の取得失敗が原因の可能性があります。</p>
    </div>
  );
}
