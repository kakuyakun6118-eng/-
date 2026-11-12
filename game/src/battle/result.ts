// 戦闘結果の集計。戦場での損害を、戦死・負傷・捕虜・逃散に分け、
// 戦略マップへ戻す兵力と指揮官の状態を決める。
import type { BattleSetup, UnitTypeId } from "../data/types";
import type { BattleResult, BattleUnit, CommanderFate, SideId, SideResult } from "./types";

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

export function buildResult(
  setup: BattleSetup, units: BattleUnit[], seconds: number,
  winner: BattleResult["winner"], reason: BattleResult["reason"],
): BattleResult {
  const rand = seeded(setup.battleId);
  const side = (id: SideId): SideResult => {
    const src = id === "attacker" ? setup.attacker : setup.defender;
    const mine = units.filter((u) => u.side === id);
    const won = winner === id;
    const lost = winner !== "draw" && !won;
    const before = { ...src.troops };
    const after: Record<UnitTypeId, number> = { infantry: 0, cavalry: 0, archer: 0 };
    let killed = 0;
    let wounded = 0;
    let captured = 0;
    let scattered = 0;

    for (const type of TYPES) {
      const list = mine.filter((u) => u.source === type);
      const start = list.reduce((s, u) => s + u.maxMen, 0);
      // 戦場に残った兵と、逃げ去った兵
      const fled = Math.round(list.filter((u) => u.escaped || u.state === "routing").reduce((s, u) => s + u.men, 0));
      const standing = Math.round(list.reduce((s, u) => s + u.men, 0)) - fled;
      const fallen = start - standing - fled;
      // 倒れた兵のうち、45%が戦死、55%が負傷。勝った側は負傷兵の多くを収容できる
      const dead = Math.round(fallen * 0.45);
      const hurt = fallen - dead;
      const recovered = Math.round(hurt * (won ? 0.7 : lost ? 0.25 : 0.5));
      // 敗れた側は、置き去りにした負傷兵と、逃げた兵の一部が捕虜になる。逃げた兵の一部は戻らない
      const taken = lost ? Math.round((hurt - recovered) * 0.6 + fled * 0.25) : 0;
      const gone = Math.round(fled * (lost ? 0.15 : 0.05));
      killed += dead;
      wounded += hurt;
      captured += taken;
      scattered += gone;
      after[type] = Math.max(0, standing + recovered + fled - (lost ? Math.round(fled * 0.25) : 0) - gone);
    }

    // 指揮官:本陣が壊滅したら戦死・捕虜・負傷のいずれか。敗走しただけなら、まれに捕まる
    const command = mine.find((u) => u.isCommand);
    let commander: CommanderFate = "healthy";
    if (!src.commander) commander = "healthy";
    else if (!command || command.men <= 0) {
      const r = rand();
      commander = r < 0.45 ? "killed" : r < 0.75 ? "captured" : "wounded";
    } else if (lost && (command.escaped || command.state === "routing")) {
      commander = rand() < 0.2 ? "captured" : rand() < 0.3 ? "wounded" : "healthy";
    } else if (command.men < command.maxMen * 0.5 && rand() < 0.4) {
      commander = "wounded";
    }

    const totalBefore = before.infantry + before.cavalry + before.archer;
    const totalAfter = after.infantry + after.cavalry + after.archer;
    const outcome: SideResult["outcome"] =
      winner === "draw" ? "draw"
      : won ? "victory"
      : totalAfter < Math.max(100, totalBefore * 0.06) ? "annihilated"
      : reason === "retreated" ? "retreated"
      : "routed";
    const avg = (f: (u: BattleUnit) => number): number =>
      mine.length > 0 ? mine.reduce((s, u) => s + f(u) * u.maxMen, 0) / mine.reduce((s, u) => s + u.maxMen, 0) : 0;
    return {
      armyId: src.armyId,
      outcome,
      before,
      after,
      killed,
      wounded,
      captured,
      scattered,
      commander,
      // 勝てば士気が上がり、敗れれば大きく下がる
      morale: Math.max(5, Math.min(100, Math.round(src.morale + (won ? 12 : lost ? -28 : -5)))),
      fatigue: Math.max(0, Math.min(100, Math.round(Math.max(src.fatigue, avg((u) => u.fatigue)) + 15))),
    };
  };

  const attacker = side("attacker");
  const defender = side("defender");
  const losses = (s: SideResult): number =>
    s.before.infantry + s.before.cavalry + s.before.archer - (s.after.infantry + s.after.cavalry + s.after.archer);
  return {
    battleId: setup.battleId,
    winner,
    reason,
    durationSeconds: Math.round(seconds),
    attackerLosses: losses(attacker),
    defenderLosses: losses(defender),
    sides: { attacker, defender },
  };
}
