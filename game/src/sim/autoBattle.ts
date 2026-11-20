// 自動戦闘:プレイヤーが関わらない戦い(AIどうし)を、3Dの戦闘を開かずに計算で決着させる。
// 兵力・兵種・地形・士気・疲労・指揮官の能力・城の防御から強さを出し、損害と勝敗を決める。
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { BattleSetup, BattleSide, TerrainKind, UnitTypeId } from "../data/types";
import { reliefArrivalDays } from "./relief";

const TYPES: UnitTypeId[] = ["infantry", "cavalry", "archer"];

/** 毎回同じ結果になる乱数(同じ戦闘は同じ結果になるように) */
function seeded(text: string): () => number {
  let a = 2166136261;
  for (let i = 0; i < text.length; i++) a = Math.imul(a ^ text.charCodeAt(i), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPEN: TerrainKind[] = ["plain", "grassland", "desert"];
const ROUGH: TerrainKind[] = ["forest", "mountain", "highMountain"];

/** 陣営の強さ。騎兵は開けた土地で強く、山や森・城攻めでは弱い */
export function sideStrength(side: BattleSide, terrain: TerrainKind, siege: boolean): number {
  const cav = siege ? 0.6 : OPEN.includes(terrain) ? 1.5 : ROUGH.includes(terrain) ? 0.8 : 1.1;
  const base = side.troops.infantry + side.troops.cavalry * cav + side.troops.archer * (siege && side.kind === "city" ? 1.3 : 0.9);
  const c = side.commander;
  const lead = c ? (c.leadership * 0.6 + c.war * 0.25 + c.intelligence * 0.15) / 300 : 0;
  return base * (0.55 + side.morale / 220) * (1 - side.fatigue / 250) * (1 + lead);
}

function total(t: Record<UnitTypeId, number>): number {
  return t.infantry + t.cavalry + t.archer;
}

function sideResult(side: BattleSide, lossRate: number, won: boolean, draw: boolean, rand: () => number, holdsCity: boolean): SideResult {
  const after: Record<UnitTypeId, number> = { infantry: 0, cavalry: 0, archer: 0 };
  for (const k of TYPES) after[k] = Math.max(0, Math.round(side.troops[k] * (1 - lossRate)));
  const lost = total(side.troops) - total(after);
  const lostSide = !won && !draw;
  let commander: CommanderFate = "healthy";
  if (side.commander) {
    const r = rand();
    if (lostSide) commander = r < 0.05 ? "killed" : r < (holdsCity ? 0.4 : 0.12) ? "captured" : r < 0.3 ? "wounded" : "healthy";
    else if (r < 0.04) commander = "wounded";
  }
  return {
    armyId: side.armyId,
    outcome: draw ? "draw" : won ? "victory" : total(after) < total(side.troops) * 0.2 ? "annihilated" : "routed",
    before: { ...side.troops },
    after,
    killed: Math.round(lost * 0.5),
    wounded: Math.round(lost * 0.2),
    captured: lostSide ? Math.round(lost * 0.2) : 0,
    scattered: lostSide ? Math.round(lost * 0.1) : 0,
    commander,
    morale: Math.max(10, Math.min(100, side.morale + (draw ? -5 : won ? 8 : -20))),
    fatigue: Math.min(100, side.fatigue + 20),
  };
}

/** 城壁による守りやすさ(防御力40で2.2倍、80で3.2倍)。戦略AIが攻めるかどうかを見積もるときも、同じ式を使う */
export function wallBonus(defense: number): number {
  return 1.2 + defense / 40;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 勝率の目安(攻撃側が勝つ見込み。0〜1)。自動戦闘と同じ強さの式(兵力・兵種・地形・士気・疲労・指揮官・城壁)から出す。
 * プレイヤーが指揮する3Dの会戦では、指揮しだいで結果が変わるので、あくまで目安。
 */
export function estimateWinRate(setup: BattleSetup): { attacker: number; defender: number; ratio: number; factors: string[] } {
  const siege = setup.battleType === "siege_battle";
  let a = Math.max(1, sideStrength(setup.attacker, setup.terrain, siege));
  let d = Math.max(1, sideStrength(setup.defender, setup.terrain, siege));
  const factors: string[] = [];
  const fort = setup.defender.fortification;
  const tac = setup.tactics;
  if (tac) {
    a *= tac.attacker ?? 1;
    d *= tac.defender ?? 1;
    for (const n of tac.notes ?? []) factors.push(n);
    if (tac.panic) factors.push(`${tac.panic === "attacker" ? "攻撃側" : "防御側"}は退くときに崩れるおそれ(${Math.round((tac.panicRisk ?? 0.4) * 100)}%)`);
  }
  if (siege && fort) {
    d *= wallBonus(fort.defense);
    factors.push(`城壁(防御${fort.defense})で守備側が${wallBonus(fort.defense).toFixed(1)}倍`);
  } else if (tac?.noRiverBonus) {
    factors.push("渡河を許したため、川の守りの利がない");
  } else {
    const bonus = terrainBonus(setup.terrain);
    d *= bonus;
    if (bonus > 1) factors.push(`地形で守備側が${bonus.toFixed(2)}倍`);
  }
  for (const [side, label] of [[setup.attacker, "攻撃側"], [setup.defender, "防御側"]] as const) {
    if (side.commander) factors.push(`${label}の指揮官 ${side.commander.name}(統率${side.commander.leadership})`);
    else factors.push(`${label}は指揮官なし`);
  }
  const ratio = a / d;
  // 強さの比が1なら五分。比が2倍で約9割になる曲線
  let p = 1 / (1 + Math.pow(ratio, -3.2));
  // 城攻めは、囲み続ける食糧がなければ落とせない
  if (siege && setup.attacker.food < 5) {
    p *= 0.4;
    factors.push("攻撃側の食糧が少ない");
  }
  p = Math.max(0.02, Math.min(0.98, p));
  return { attacker: p, defender: 1 - p, ratio, factors };
}

/** 野戦で、守る側が地形から受ける利(山・丘・森・川) */
function terrainBonus(terrain: TerrainKind): number {
  return terrain === "mountain" || terrain === "highMountain" ? 1.25 : terrain === "hill" || terrain === "forest" ? 1.1 : terrain === "river" || terrain === "crossing" ? 1.2 : 1;
}

export function autoResolve(setup: BattleSetup): BattleResult {
  const rand = seeded(setup.battleId + setup.createdAt.day);
  const siege = setup.battleType === "siege_battle";
  const fort = setup.defender.fortification;
  let a = sideStrength(setup.attacker, setup.terrain, siege) * (0.85 + rand() * 0.3);
  let d = sideStrength(setup.defender, setup.terrain, siege);
  const t = setup.tactics;
  if (siege && fort) {
    d *= wallBonus(fort.defense);
  } else if (!(t?.noRiverBonus && (setup.terrain === "river" || setup.terrain === "crossing" || setup.terrain === "greatRiver"))) {
    d *= terrainBonus(setup.terrain);
  }
  // 作戦:連携・指揮の補正と、撤退時の混乱(退くときに陣が崩れれば、数の多い側でも大敗する)
  if (t) {
    a *= t.attacker ?? 1;
    d *= t.defender ?? 1;
    if (t.panic) {
      const hit = rand() < (t.panicRisk ?? 0.4);
      if (hit) {
        if (t.panic === "attacker") a *= 0.45 + rand() * 0.2;
        else d *= 0.45 + rand() * 0.2;
      }
    }
  }
  a = Math.max(1, a);
  d = Math.max(1, d);
  const ratio = a / d;

  if (siege) return resolveSiege(setup, a, d, rand);

  const adv = Math.max(ratio, 1 / ratio);
  const draw = adv < 1.05;
  const attackerWon = !draw && ratio > 1;
  const loserRate = clamp(0.2 + 0.15 * (adv - 1), 0.2, 0.85);
  const winnerRate = clamp(0.14 / adv, 0.03, 0.14);
  const attacker = sideResult(setup.attacker, draw ? 0.12 : attackerWon ? winnerRate : loserRate, attackerWon, draw, rand, false);
  const defender = sideResult(setup.defender, draw ? 0.12 : attackerWon ? loserRate : winnerRate, !draw && !attackerWon, draw, rand, false);
  return {
    battleId: setup.battleId,
    winner: draw ? "draw" : attackerWon ? "attacker" : "defender",
    reason: draw ? "timeout" : "routed",
    durationSeconds: 0,
    attackerLosses: total(attacker.before) - total(attacker.after),
    defenderLosses: total(defender.before) - total(defender.after),
    sides: { attacker, defender },
  };
}

/**
 * 自動の攻城戦(Version 42:救援軍の到着を、手動の攻城戦と同じ決まりで扱う)。
 * まず守備兵だけで、落城(または包囲の失敗)までの日数を見積もる。救援軍は、着いた日から守りに加わり、
 * 残りの日数を、強さの比で延ばす(または縮める)。落城より遅く着く救援軍は、加わらず、兵も失わない。
 */
function resolveSiege(setup: BattleSetup, a: number, dAll: number, rand: () => number): BattleResult {
  const fort = setup.defender.fortification;
  const wall = fort ? wallBonus(fort.defense) : 1;
  const relief = (setup.defender.supporters ?? []).filter((x) => x.relief);
  // 守備兵だけの強さ(救援軍の兵を除く)
  const garrison: BattleSide = { ...setup.defender, troops: { ...setup.defender.troops }, supporters: [] };
  for (const r of relief) for (const k of TYPES) garrison.troops[k] = Math.max(0, garrison.troops[k] - r.relief!.by[k]);
  const strOf = (side: BattleSide): number => sideStrength(side, setup.terrain, true);
  const t = setup.tactics;
  let dGar = strOf(garrison) * wall * (t?.defender ?? 1);
  void dAll;
  dGar = Math.max(1, dGar);
  let ratio = a / dGar;
  let days = clamp(14 / ratio, 5, 60);
  const joined: typeof relief = [];
  for (const r of [...relief].sort((x, y) => x.relief!.arriveSec - y.relief!.arriveSec)) {
    const at = reliefArrivalDays(r.relief!.arriveSec);
    if (at >= days) continue; // 着く前に決着する
    const side: BattleSide = { ...setup.defender, kind: "army", troops: { ...r.relief!.by }, morale: r.relief!.morale, commander: null, fortification: null, supporters: [] };
    // 城外から攻め手の背後を突くので、城壁の利は受けない
    const add = strOf(side);
    const before = ratio;
    dGar += add;
    ratio = a / dGar;
    days = at + (days - at) * (before / ratio);
    joined.push(r);
  }
  const daysR = clamp(Math.round(days), 5, 90);
  const captured = ratio >= 1 && setup.attacker.food >= daysR * 0.5;
  const attacker = sideResult(setup.attacker, captured ? clamp(0.22 / ratio, 0.05, 0.3) : clamp(0.18 + 0.1 * rand(), 0.15, 0.3), captured, false, rand, false);
  const defLoss = captured ? 0.7 : clamp(0.15 * ratio, 0.03, 0.3);
  const gres = sideResult(garrison, defLoss, !captured, false, rand, true);
  // 救援軍の結果:加わった軍は守りと同じ割合(落城なら城外にいるので半分)で失い、加わらなかった軍は失わない
  const reliefOut: NonNullable<BattleResult["relief"]> = {};
  const before = { ...gres.before };
  const after = { ...gres.after };
  for (const r of relief) {
    const by = r.relief!.by;
    const rate = joined.includes(r) ? (captured ? defLoss * 0.5 : defLoss) : 0;
    const out: Record<UnitTypeId, number> = { infantry: 0, cavalry: 0, archer: 0 };
    for (const k of TYPES) {
      out[k] = Math.max(0, Math.round(by[k] * (1 - rate)));
      before[k] += by[k];
      after[k] += out[k];
    }
    reliefOut[r.armyId] = { after: out, morale: joined.includes(r) ? Math.max(5, Math.min(100, r.relief!.morale + (captured ? -20 : 10))) : r.relief!.morale };
  }
  const defender: SideResult = { ...gres, before, after };
  if (!captured) attacker.outcome = "retreated";
  return {
    battleId: setup.battleId,
    winner: captured ? "attacker" : "defender",
    reason: captured ? "captured" : "retreated",
    durationSeconds: 0,
    attackerLosses: total(attacker.before) - total(attacker.after),
    defenderLosses: total(defender.before) - total(defender.after),
    siege: {
      cityId: setup.defender.cityId ?? "",
      captured,
      days: daysR,
      wallDamage: clamp(0.15 * ratio, 0, 0.6),
      gateDamage: clamp(0.25 * ratio, 0, 0.9),
      foodLeft: Math.max(0, setup.defender.food - daysR),
    },
    sides: { attacker, defender },
    relief: Object.keys(reliefOut).length ? reliefOut : undefined,
    reliefJoined: joined.map((x) => x.armyId),
  };
}
