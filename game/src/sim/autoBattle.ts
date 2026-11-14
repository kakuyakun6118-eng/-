// 自動戦闘:プレイヤーが関わらない戦い(AIどうし)を、3Dの戦闘を開かずに計算で決着させる。
// 兵力・兵種・地形・士気・疲労・指揮官の能力・城の防御から強さを出し、損害と勝敗を決める。
import type { BattleResult, CommanderFate, SideResult } from "../battle/types";
import type { BattleSetup, BattleSide, TerrainKind, UnitTypeId } from "../data/types";

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

export function autoResolve(setup: BattleSetup): BattleResult {
  const rand = seeded(setup.battleId + setup.createdAt.day);
  const siege = setup.battleType === "siege_battle";
  const fort = setup.defender.fortification;
  let a = sideStrength(setup.attacker, setup.terrain, siege) * (0.85 + rand() * 0.3);
  let d = sideStrength(setup.defender, setup.terrain, siege);
  if (siege && fort) {
    d *= wallBonus(fort.defense);
  } else {
    d *= setup.terrain === "mountain" || setup.terrain === "highMountain" ? 1.25 : setup.terrain === "hill" || setup.terrain === "forest" ? 1.1 : setup.terrain === "river" || setup.terrain === "crossing" ? 1.2 : 1;
  }
  a = Math.max(1, a);
  d = Math.max(1, d);
  const ratio = a / d;

  if (siege) {
    const days = clamp(Math.round(14 / ratio), 5, 60);
    // 落とせるのは、強さで上回り、囲み続けるだけの食糧があるとき
    const captured = ratio >= 1 && setup.attacker.food >= days * 0.5;
    const attacker = sideResult(setup.attacker, captured ? clamp(0.22 / ratio, 0.05, 0.3) : clamp(0.18 + 0.1 * rand(), 0.15, 0.3), captured, false, rand, false);
    const defender = sideResult(setup.defender, captured ? 0.7 : clamp(0.15 * ratio, 0.03, 0.3), !captured, false, rand, true);
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
        days,
        wallDamage: clamp(0.15 * ratio, 0, 0.6),
        gateDamage: clamp(0.25 * ratio, 0, 0.9),
        foodLeft: Math.max(0, setup.defender.food - days),
      },
      sides: { attacker, defender },
    };
  }

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
