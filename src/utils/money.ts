import { Expense, Payer } from "../types";

/**
 * New York City sales tax on restaurant meals and most goods. Clothing and
 * footwear under $110 per item are exempt, which is why the tip calculator
 * lets you type the pre-tax subtotal instead of assuming this rate applies.
 */
export const NYC_SALES_TAX = 0.08875;

export const TIP_PRESETS = [18, 20, 22];

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
}

export function toYen(usd: number, rate: number | undefined): number {
  return usd * (rate && rate > 0 ? rate : 0);
}

export interface TipResult {
  /** Amount the tip percentage was applied to. */
  tipBase: number;
  tip: number;
  total: number;
  perPerson: number;
}

/**
 * `amount` is whatever is printed on the check. When it is the pre-tax
 * subtotal, tax is added on; when it already includes tax, the tip is
 * calculated on the pre-tax portion — tipping on the tax is the thing
 * everyone accidentally does and nobody actually intends.
 */
export function calcTip(
  amount: number,
  tipPercent: number,
  includesTax: boolean,
  splitBetween: number,
): TipResult {
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const subtotal = includesTax ? safe / (1 + NYC_SALES_TAX) : safe;
  const withTax = includesTax ? safe : safe * (1 + NYC_SALES_TAX);
  const tip = subtotal * (tipPercent / 100);
  const total = withTax + tip;
  const people = splitBetween > 0 ? splitBetween : 1;
  return { tipBase: subtotal, tip, total, perPerson: total / people };
}

export interface Settlement {
  totalUsd: number;
  byPayer: Record<Payer, number>;
  /** Who owes whom, already reduced to a single transfer. */
  owed: { from: Payer; to: Payer; amountUsd: number } | null;
}

/**
 * Splits everything down the middle. Anything paid from the shared wallet is
 * counted in the total but left out of the settlement — it came out of both
 * pockets already, so squaring it up would double-count it.
 */
export function settle(expenses: Expense[]): Settlement {
  const byPayer: Record<Payer, number> = { me: 0, partner: 0, shared: 0 };
  for (const e of expenses) {
    if (Number.isFinite(e.amountUsd)) byPayer[e.payer] += e.amountUsd;
  }
  const totalUsd = byPayer.me + byPayer.partner + byPayer.shared;

  const personal = byPayer.me + byPayer.partner;
  const fairShare = personal / 2;
  const diff = byPayer.me - fairShare;

  // Under a cent apart is square enough.
  const owed =
    Math.abs(diff) < 0.005
      ? null
      : diff > 0
        ? { from: "partner" as Payer, to: "me" as Payer, amountUsd: diff }
        : { from: "me" as Payer, to: "partner" as Payer, amountUsd: -diff };

  return { totalUsd, byPayer, owed };
}
