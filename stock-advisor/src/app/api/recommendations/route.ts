import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/watchlist";
import { getQuote } from "@/lib/prices";
import { getHeadlines } from "@/lib/news";
import { judgeImpact } from "@/lib/llm";
import { buildRecommendation, rankRecommendations } from "@/lib/scoring";
import type { Recommendation } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const watchlist = await getWatchlist();

  const recs = (
    await Promise.all(
      watchlist.map(async (entry): Promise<Recommendation | null> => {
        const quote = await getQuote(entry.ticker);
        if (!quote) return null;
        const headlines = await getHeadlines(entry.ticker, entry.name);
        const impact = await judgeImpact(entry.ticker, entry.name, headlines);
        return buildRecommendation(entry.ticker, entry.name, quote, impact);
      })
    )
  ).filter((r): r is Recommendation => r !== null);

  return NextResponse.json(rankRecommendations(recs));
}
