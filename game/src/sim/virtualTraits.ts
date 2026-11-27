// 仮想シナリオの特殊能力(劉皓の8つの固有能力と、家臣の特殊能力)を、ゲームの計算に効かせるための道具。
// 効果は src/data/rules/virtualTraits.json に書く。重なっても異常な値にならないよう、倍率と確率には上限をかける(確率は0〜100%)。
import rules from "../data/rules/virtualTraits.json";
import { persons, scenario } from "../data";
import type { BattleSide, Person, TerrainKind } from "../data/types";

export interface TraitEffect {
  scope: "command" | "ruler" | "faction" | "governor" | "person";
  label: string;
  battle?: number; attack?: number; defend?: number; morale?: number; cavalry?: number; infantry?: number; archer?: number; siege?: number; naval?: number;
  march?: number; food?: number; fatigue?: number; income?: number; grain?: number; cityIncome?: number; order?: number; recruit?: number; plot?: number; plotResist?: number;
  loyalty?: number; volunteer?: boolean; amity?: number; affection?: number; heal?: number; cityDefense?: number; succession?: boolean;
  // ---- Version 67:国全体にかかる効果(君主・国の人物・漢の正統) ----
  /** 国のすべての軍団の会戦の強さの倍率 */
  armyBattle?: number;
  /** 徴兵の効率(同じ金・兵糧で集まる兵の倍率) */
  conscript?: number;
  /** 国のすべての軍団の兵糧の消費の倍率 */
  armyFood?: number;
  /** 毎月、家臣の忠誠・都市の治安に足す値 */
  loyaltyMonthly?: number;
  orderMonthly?: number;
  /** 皇族の能力の伸び(教育)の倍率 */
  growth?: number;
  /** 反乱・離反の起こりやすさの倍率 */
  rebellion?: number;
  /** 人口の増え方の倍率 */
  pop?: number;
  /** 君主のときだけ加わる効果(指揮の能力が、君主になると国の効果も持つ) */
  ruler?: Partial<TraitEffect>;
  /** 戦略AIの性格への足し算(攻撃性・統一志向・外交志向。-1〜1) */
  ai?: { aggr?: number; unify?: number; diplomacy?: number };
}
const TRAITS = (rules as unknown as { traits: Record<string, TraitEffect> }).traits;
export const LIMITS = (rules as unknown as { limits: { battle: number; income: number; order: number; recruitMax: number; plotMax: number; amity: number; affection: number; loyalty: number; conscript: number; armyFood: number; monthly: number; growth: number; rebellion: number; pop: number } }).limits;

/**
 * 漢の正統(Version 67):劉皓と、その直系の子孫が、漢の正式な皇帝として在位しているあいだだけ、国に一度だけかかる。
 * 皇族の人数では重ならない(国ごとに1つ)。判定は宮廷(court)が登録する(劉淵の漢・前趙・宋など、ほかの劉氏の国には付かない)
 */
export const HAN_LEGITIMACY = "漢の正統";
let legitHook: (f: string) => boolean = () => false;
export function setLegitimacyHook(fn: (f: string) => boolean): void { legitHook = fn; clearTraitCache(); }
export const isLegitimate = (f: string | undefined): boolean => !!f && scenario.virtual === true && legitHook(f);

/** その人物の特殊能力(効果表にあるものだけ) */
export function effectsOf(p: Person | null | undefined, scope?: TraitEffect["scope"]): { name: string; e: TraitEffect }[] {
  if (!p?.traits?.length) return [];
  return p.traits.map((name) => ({ name, e: TRAITS[name] })).filter((x) => x.e && (!scope || x.e.scope === scope));
}
const alive = (p: Person, status?: (id: string) => string): boolean => !status || status(p.id) !== "dead";
const RIVER: TerrainKind[] = ["river", "crossing", "greatRiver"];

/**
 * 会戦の強さの倍率(指揮官の特殊能力)。重なっても上限(2倍)を超えない。理由の文もつける
 */
export function battleTraitMult(side: BattleSide, attacking: boolean, siege: boolean, terrain: TerrainKind, naval: boolean): { mult: number; notes: string[] } {
  const list = effectsOf(side.commander, "command");
  // 国全体の会戦の倍率(漢の正統・皇帝の固有特性)。指揮官の能力と合わせて、上限(2倍)の内側に収める
  const fa = scenario.virtual ? factionMult(factionTraitEffects(side.factionId, -1), "armyBattle", 1, LIMITS.battle) : 1;
  if (!list.length && fa === 1) return { mult: 1, notes: [] };
  const n = side.troops.infantry + side.troops.cavalry + side.troops.archer || 1;
  const share = { cavalry: side.troops.cavalry / n, infantry: side.troops.infantry / n, archer: side.troops.archer / n };
  let mult = 1;
  const notes: string[] = [];
  for (const { name, e } of list) {
    let m = e.battle ?? 1;
    if (attacking && e.attack) m *= e.attack;
    if (!attacking && e.defend) m *= e.defend;
    if (siege && attacking && e.siege) m *= e.siege;
    for (const k of ["cavalry", "infantry", "archer"] as const) if (e[k]) m *= 1 + (e[k]! - 1) * share[k];
    if (e.naval && naval && RIVER.includes(terrain)) m *= e.naval;
    if (m !== 1) notes.push(`${side.commander!.name}の${name}(×${m.toFixed(2)})`);
    mult *= m;
  }
  if (fa !== 1) { notes.push(`国の補正(漢の正統・皇帝の特性 ×${fa.toFixed(2)})`); mult *= fa; }
  if (mult > LIMITS.battle) {
    notes.push(`特殊能力の重なりは×${LIMITS.battle}までに抑える`);
    mult = LIMITS.battle;
  }
  return { mult, notes };
}

/** 士気の倍率(天命覇王)。結果は100を超えない */
export function moraleWithTraits(morale: number, commander: Person | null | undefined): number {
  let m = 1;
  for (const { e } of effectsOf(commander, "command")) if (e.morale) m *= e.morale;
  return Math.max(0, Math.min(100, Math.round(morale * Math.min(2, m))));
}

/** 軍団の兵糧の消費・疲れ・行軍の倍率(指揮官の特殊能力) */
export function armyUpkeepMult(commander: Person | null | undefined): { food: number; fatigue: number; march: number } {
  let food = 1, fatigue = 1, march = 1;
  for (const { e } of effectsOf(commander, "command")) {
    if (e.food) food *= e.food;
    if (e.fatigue) fatigue *= e.fatigue;
    if (e.march) march *= e.march;
  }
  return { food: Math.max(0.25, food), fatigue: Math.max(0.25, fatigue), march: Math.min(1.5, march) };
}

/** 国の効果:君主(ruler)と、その国にいる人物(faction)の能力を合わせる */
function factionEffects(f: string, status?: (id: string) => string): TraitEffect[] {
  const out: TraitEffect[] = [];
  for (const p of persons) {
    if (p.factionId !== f || !p.traits?.length || !alive(p, status)) continue;
    for (const { e } of effectsOf(p)) {
      if (e.scope === "faction" || (e.scope === "ruler" && p.role === "ruler")) out.push(e);
      if (e.ruler && p.role === "ruler") out.push({ ...e.ruler, scope: "ruler", label: e.label } as TraitEffect);
    }
  }
  // 漢の正統:国に1つだけ(皇族が何人いても重ならない)
  if (legitHook(f) && TRAITS[HAN_LEGITIMACY]) out.push(TRAITS[HAN_LEGITIMACY]);
  return out;
}
/** 速く引くための控え(毎月の計算で何度も呼ぶため、日ごとに作り直す) */
let cacheDay = -1;
const cache = new Map<string, TraitEffect[]>();
export function factionTraitEffects(f: string, day: number, status?: (id: string) => string): TraitEffect[] {
  if (!scenario.virtual) return [];
  // day = -1:いまの日の控えを使う(会戦の計算など、日を持たない呼び出し)
  if (day === -1) day = cacheDay;
  if (day !== cacheDay) { cache.clear(); cacheDay = day; }
  let v = cache.get(f);
  if (!v) { v = factionEffects(f, status); cache.set(f, v); }
  return v;
}
export function clearTraitCache(): void { cacheDay = -1; cache.clear(); }

/** 国の金・兵糧の収入の倍率(上限2倍) */
export function incomeMult(list: TraitEffect[]): { gold: number; grain: number } {
  let gold = 1, grain = 1;
  for (const e of list) { if (e.income) gold *= e.income; if (e.grain) grain *= e.grain; }
  return { gold: Math.min(LIMITS.income, gold), grain: Math.min(LIMITS.income, grain) };
}
/** 太守の都市の収入・治安の戻り・城の守りの倍率 */
export function governorMult(gov: Person | null | undefined): { income: number; order: number; defense: number } {
  let income = 1, order = 1, defense = 1;
  for (const { e } of effectsOf(gov, "governor")) { if (e.cityIncome) income *= e.cityIncome; if (e.order) order *= e.order; if (e.cityDefense) defense *= e.cityDefense; }
  return { income: Math.min(LIMITS.income, income), order: Math.min(LIMITS.order, order), defense: Math.min(1.5, defense) };
}
/** 国の治安の戻りの倍率(上限3倍) */
export function orderMult(list: TraitEffect[]): number {
  let m = 1;
  for (const e of list) if (e.order) m *= e.order;
  return Math.min(LIMITS.order, m);
}
/** 国の効果の倍率(上下限つき) */
export function factionMult(list: TraitEffect[], k: "armyBattle" | "conscript" | "armyFood" | "growth" | "rebellion" | "pop", min: number, max: number): number {
  const m = list.reduce((s, e) => s * (e[k] ?? 1), 1);
  return Math.max(min, Math.min(max, m));
}
/** 国の効果の足し算(毎月の忠誠・治安。上限つき) */
export function factionFlat(list: TraitEffect[], k: "loyaltyMonthly" | "orderMonthly"): number {
  return Math.min(LIMITS.monthly, list.reduce((s, e) => s + (e[k] ?? 0), 0));
}
/** 戦略AIの性格への足し算(君主と国の効果から。-1〜1に収める) */
export function aiBias(list: TraitEffect[]): { aggr: number; unify: number; diplomacy: number } {
  const o = { aggr: 0, unify: 0, diplomacy: 0 };
  for (const e of list) if (e.ai) for (const k of ["aggr", "unify", "diplomacy"] as const) o[k] += e.ai[k] ?? 0;
  for (const k of ["aggr", "unify", "diplomacy"] as const) o[k] = Math.max(-1, Math.min(1, o[k]));
  return o;
}
/** 加える値(登用の見込み・忠誠)、倍率(調略・友好度・負傷) */
export const sumOf = (list: TraitEffect[], k: "recruit" | "loyalty"): number => Math.min(k === "loyalty" ? LIMITS.loyalty : 1, list.reduce((s, e) => s + (e[k] ?? 0), 0));
export const prodOf = (list: TraitEffect[], k: "plot" | "plotResist" | "amity" | "heal"): number => Math.min(k === "amity" ? LIMITS.amity : 9, list.reduce((s, e) => s * (e[k] ?? 1), 1));
/** 本人の効果(絶世の英姿:友好度・後宮の好感度) */
export function personMult(p: Person | null | undefined, k: "amity" | "affection"): number {
  let m = 1;
  for (const { e } of effectsOf(p)) if (e[k]) m *= e[k]!;
  return Math.min(k === "amity" ? LIMITS.amity : LIMITS.affection, m);
}
/** 確率を0〜1に収める */
export const prob = (x: number, max = 1): number => Math.max(0, Math.min(max, x));
export { TRAITS };
