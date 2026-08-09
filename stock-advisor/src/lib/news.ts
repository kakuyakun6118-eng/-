import Parser from "rss-parser";
import type { NewsItem } from "./types";
import { cached, TTL } from "./cache";
import { recordFailure } from "./dataHealth";
import { NEWS_FEED_SIZE } from "./config";

const parser = new Parser();

/**
 * Pluggable news source. Google News RSS needs no key and covers Japanese
 * financial news, which is why it is the default — implement this interface to
 * swap in a paid feed.
 */
export interface NewsSource {
  fetchFeed(ticker: string, query: string, limit: number): Promise<NewsItem[]>;
}

const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";

export class GoogleNewsSource implements NewsSource {
  async fetchFeed(ticker: string, query: string, limit: number): Promise<NewsItem[]> {
    const url = `${GOOGLE_NEWS_RSS}?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
    try {
      const feed = await parser.parseURL(url);
      return (feed.items ?? []).slice(0, limit).map((item) => ({
        ticker,
        title: item.title ?? "",
        link: item.link ?? "",
        pubDate: item.pubDate ?? null,
        source: item.creator ?? "Google News",
      }));
    } catch (err) {
      console.error(`[news] failed to fetch feed for ${ticker} (${query})`, err);
      recordFailure("news", err);
      return [];
    }
  }
}

const defaultSource: NewsSource = new GoogleNewsSource();

function queryFor(ticker: string, name?: string): string {
  return name ? `${name} 株価` : `${ticker} 株価`;
}

/**
 * The full recent feed for a ticker.
 *
 * Rule 1 of the theory counts articles, so the feed is fetched deep enough to
 * see both the last 24 hours and enough older items to derive a rate from.
 */
export async function getNewsFeed(ticker: string, name?: string): Promise<NewsItem[]> {
  const query = queryFor(ticker, name);
  return cached(`news:${ticker}:${query}:${NEWS_FEED_SIZE}`, TTL.news, () => defaultSource.fetchFeed(ticker, query, NEWS_FEED_SIZE));
}

/** The handful of most recent headlines, for the LLM to read. */
export async function getHeadlines(ticker: string, name?: string): Promise<NewsItem[]> {
  return (await getNewsFeed(ticker, name)).slice(0, 8);
}
