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

/** 紫蘇の葉理論 verdict bands, derived from the scorecard total (-30..70). */
export type TheoryVerdict = "strong" | "watch" | "neutral" | "caution";

/** Rule 1: 話題性の急上昇 (+30). Counted, not inferred. */
export interface BuzzSurge {
  applies: boolean;
  points: number;
  mentions24h: number;
  /** Mentions per day over the period before the last 24h; null when history is too short to judge. */
  baselineDaily: number | null;
  ratio: number | null;
  detail: string;
}

/** Rules 2 and 3, which require reading what the posts say. */
export interface ContentAssessment {
  positiveCatalyst: boolean;
  catalystType: string | null;
  riskFlag: boolean;
  riskType: string | null;
  reasoning: string;
}

export interface TheoryScore {
  ticker: string;
  /** Rule 1: 話題性の急上昇 (+30) */
  buzz: BuzzSurge;
  /** Rule 2: ポジティブ感 (+40) */
  catalyst: { applies: boolean; points: number; type: string | null };
  /** Rule 3: リスクの有無 (-30) */
  risk: { applies: boolean; points: number; type: string | null };
  total: number;
  verdict: TheoryVerdict;
  reasoning: string;
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
