import { NextResponse } from "next/server";
import { listHoldings } from "@/lib/holdingsStore";
import { getQuote } from "@/lib/prices";
import { getHeadlines } from "@/lib/news";
import { judgeImpact } from "@/lib/llm";
import { getTheoryScoresByTicker } from "@/lib/accountActivity";
import { buildHoldingVerdict } from "@/lib/scoring";
import type { HoldingVerdict } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const [holdings, theoryScores] = await Promise.all([listHoldings(), getTheoryScoresByTicker()]);

  const verdicts: HoldingVerdict[] = await Promise.all(
    holdings.map(async (holding) => {
      const quote = await getQuote(holding.ticker);
      const headlines = await getHeadlines(holding.ticker, holding.name);
      const impact = await judgeImpact(holding.ticker, holding.name, headlines);
      return buildHoldingVerdict(holding, quote, impact, theoryScores.get(holding.ticker) ?? null);
    })
  );

  return NextResponse.json(verdicts);
}
