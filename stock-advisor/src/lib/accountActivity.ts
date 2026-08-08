import { getWatchedAccounts } from "./watchedAccounts";
import { getRecentPosts, postsToNewsItems, type SocialPost } from "./socialSource";
import { judgeImpact } from "./llm";
import type { ImpactJudgment } from "./types";

export interface TickerMention {
  ticker: string;
  impact: ImpactJudgment;
}

export interface AccountActivity {
  handle: string;
  label?: string;
  posts: SocialPost[];
  mentions: TickerMention[];
}

export async function loadAccountActivity(): Promise<AccountActivity[]> {
  const accounts = await getWatchedAccounts();

  return Promise.all(
    accounts.map(async (account): Promise<AccountActivity> => {
      const posts = await getRecentPosts(account.handle);
      const tickers = [...new Set(posts.flatMap((p) => p.tickers))];

      const mentions = await Promise.all(
        tickers.map(async (ticker): Promise<TickerMention> => {
          const items = postsToNewsItems(ticker, posts);
          const impact = await judgeImpact(ticker, undefined, items);
          return { ticker, impact };
        })
      );

      return { handle: account.handle, label: account.label, posts, mentions };
    })
  );
}
