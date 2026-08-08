export interface Holding {
  id: string;
  ticker: string; // e.g. "7203.T"
  name?: string;
  shares: number;
  costBasis: number; // average acquisition price per share, JPY
  note?: string;
}

export interface PriceQuote {
  ticker: string;
  price: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  avgVolume10d: number | null;
  currency: string;
  marketTime: string | null;
}

export interface NewsItem {
  ticker: string;
  title: string;
  link: string;
  pubDate: string | null;
  source: string;
}

export type ImpactVerdict = "positive" | "negative" | "neutral";

export interface ImpactJudgment {
  ticker: string;
  score: number; // -100 (very negative) .. 100 (very positive)
  verdict: ImpactVerdict;
  reasoning: string;
  basedOn: NewsItem[];
}

export interface Recommendation {
  ticker: string;
  name?: string;
  quote: PriceQuote;
  impact: ImpactJudgment;
  combinedScore: number;
  verdict: ImpactVerdict;
}

export type HoldingAction = "sell" | "hold" | "watch";

export interface HoldingVerdict {
  holding: Holding;
  quote: PriceQuote | null;
  unrealizedPnLPercent: number | null;
  impact: ImpactJudgment | null;
  action: HoldingAction;
  reasoning: string;
}
