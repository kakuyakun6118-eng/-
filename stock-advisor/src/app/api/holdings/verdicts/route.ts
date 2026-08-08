import { NextResponse } from "next/server";
import { listHoldings } from "@/lib/holdingsStore";
import { getQuote } from "@/lib/prices";
import { getHeadlines } from "@/lib/news";
import { judgeImpact } from "@/lib/llm";
import { buildHoldingVerdict } from "@/lib/scoring";
import type { HoldingVerdict } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const holdings = await listHoldings();

  const verdicts: HoldingVerdict[] = await Promise.all(
    holdings.map(async (holding) => {
      const quote = await getQuote(holding.ticker);
      const headlines = await getHeadlines(holding.ticker, holding.name);
      const impact = await judgeImpact(holding.ticker, holding.name, headlines);
      return buildHoldingVerdict(holding, quote, impact);
    })
  );

  return NextResponse.json(verdicts);
}
