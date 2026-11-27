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
  loyalty?: number; volunteer?: boolean; amity?: number; affection?: number; heal?: number; cityDefense?: number;
}
const TRAITS = (rules as unknown as { traits: Record<string, TraitEffect> }).traits;
export const LIMITS = (rules as unknown as { limits: { battle: number; income: number; order: number; recruitMax: number; plotMax: number; amity: number; affection: number } }).limits;

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
  if (!list.length) return { mult: 1, notes: [] };
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
    for (const { e } of effectsOf(p)) if (e.scope === "faction" || (e.scope === "ruler" && p.role === "ruler")) out.push(e);
  }
  return out;
}
/** 速く引くための控え(毎月の計算で何度も呼ぶため、日ごとに作り直す) */
let cacheDay = -1;
const cache = new Map<string, TraitEffect[]>();
export function factionTraitEffects(f: string, day: number, status?: (id: string) => string): TraitEffect[] {
  if (!scenario.virtual) return [];
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
/** 加える値(登用の見込み・忠誠)、倍率(調略・友好度・負傷) */
export const sumOf = (list: TraitEffect[], k: "recruit" | "loyalty"): number => list.reduce((s, e) => s + (e[k] ?? 0), 0);
export const prodOf = (list: TraitEffect[], k: "plot" | "plotResist" | "amity" | "heal"): number => list.reduce((s, e) => s * (e[k] ?? 1), 1);
/** 本人の効果(絶世の英姿:友好度・後宮の好感度) */
export function personMult(p: Person | null | undefined, k: "amity" | "affection"): number {
  let m = 1;
  for (const { e } of effectsOf(p)) if (e[k]) m *= e[k]!;
  return Math.min(k === "amity" ? LIMITS.amity : LIMITS.affection, m);
}
/** 確率を0〜1に収める */
export const prob = (x: number, max = 1): number => Math.max(0, Math.min(max, x));
export { TRAITS };
