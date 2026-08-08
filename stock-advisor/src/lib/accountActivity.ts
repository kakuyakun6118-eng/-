import { getWatchedAccounts } from "./watchedAccounts";
import { getRecentPosts, postsToNewsItems, normalizeTicker, type SocialPost } from "./socialSource";
import { getWatchlist } from "./watchlist";
import { listHoldings } from "./holdingsStore";
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
  const [accounts, watchlist, holdings] = await Promise.all([getWatchedAccounts(), getWatchlist(), listHoldings()]);

  // Bare 4-digit numbers in a post only count as codes if they're in the
  // user's own universe — otherwise dates and prices get read as tickers.
  const knownTickers = [...watchlist.map((w) => w.ticker), ...holdings.map((h) => h.ticker)].map(normalizeTicker);

  return Promise.all(
    accounts.map(async (account): Promise<AccountActivity> => {
      const posts = await getRecentPosts(account.handle, knownTickers);
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
