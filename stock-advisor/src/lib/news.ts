import Parser from "rss-parser";
import type { NewsItem } from "./types";
import { cached, TTL } from "./cache";

const parser = new Parser();

/**
 * Pluggable news/social-post source. The architecture this app follows
 * puts an X (Twitter) feed here; that requires a paid X API plan and
 * OAuth credentials this environment doesn't have. Google News RSS needs
 * no key and covers Japanese financial news, so it's the default source
 * — swap in a real X ingester later by implementing the same interface.
 */
export interface NewsSource {
  fetchHeadlines(ticker: string, query: string): Promise<NewsItem[]>;
}

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

export class GoogleNewsSource implements NewsSource {
  async fetchHeadlines(ticker: string, query: string): Promise<NewsItem[]> {
    const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
    try {
      const feed = await parser.parseURL(url);
      return (feed.items ?? []).slice(0, 8).map((item) => ({
        ticker,
        title: item.title ?? "",
        link: item.link ?? "",
        pubDate: item.pubDate ?? null,
        source: item.creator ?? "Google News",
      }));
    } catch (err) {
      console.error(`[news] failed to fetch headlines for ${ticker} (${query})`, err);
      return [];
    }
  }
}

const defaultSource: NewsSource = new GoogleNewsSource();

export async function getHeadlines(ticker: string, name?: string): Promise<NewsItem[]> {
  const query = name ? `${name} 株価` : `${ticker} 株価`;
  return cached(`news:${ticker}:${query}`, TTL.news, () => defaultSource.fetchHeadlines(ticker, query));
}
