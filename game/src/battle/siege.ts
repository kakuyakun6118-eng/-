// 攻城戦の決まり。城壁と城門(耐久力を持つ障害物)、守備隊と攻城兵器の配置、
// 日数の経過と食糧、降伏、中心部の占領を扱う。野戦の計算(BattleSim)に重ねて使う。
import engineRules from "../data/rules/siegeEngines.json";
import type { BattleSetup, CityLayout, Fortification, SiegeOutcome } from "../data/types";
import type { BattleSim } from "./BattleSim";
import { deploy, FIELD, shapeUnit, unitClasses, type Deployment } from "./deploy";
import type { BattleUnit, UnitClassId } from "./types";

/** 攻城戦の1日が、戦闘の何秒にあたるか */
export const SECONDS_PER_DAY = 20;
/** 攻める面(南面)の城壁の位置 */
const SOUTH_Z = 5;
const GATE_WIDTH = 11;

/** 城壁の1区画、または城門 */
export interface SiegeSegment {
  id: string;
  kind: "wall" | "gate";
  /** 攻める面にあるか(東・西・北の城壁は、壊せない囲いとして扱う) */
  south: boolean;
  x: number;
  z: number;
  /** 東西・南北の大きさ */
  w: number;
  d: number;
  hp: number;
  maxHp: number;
  /** 雲梯や櫓が取り付いているときの、登りやすさ(0 なら登れない) */
  scalable: number;
}

export interface SiegeLayout {
  /** 城の中心と、東西・南北の大きさ */
  cx: number;
  cz: number;
  w: number;
  d: number;
  wallHeight: number;
  thick: number;
  southZ: number;
  segments: SiegeSegment[];
  /** 都市の中心部(内城・宮城)。ここを押さえると陥落する */
  keep: { x: number; z: number; r: number };
  /** 内城(城壁で囲まれた中心部)があるか */
  hasInner: boolean;
}

/** 都市の設計図と城郭の数値から、戦場に建てる城の配置を決める */
export function createSiegeLayout(layout: CityLayout, fort: Fortification): SiegeLayout {
  // 戦場(約4km×3km)に収まるよう、大きな都市は縮めて置く。規模の大小の順は保つ
  const w = Math.max(90, Math.min(240, layout.size[0] * 62));
  const d = Math.max(60, Math.min(118, layout.size[1] * 44));
  const thick = Math.max(4.5, Math.min(7, layout.wallThickness * 48));
  const wallHeight = Math.max(5.5, Math.min(11, layout.wallHeight * 58));
  const cz = SOUTH_Z - d / 2;
  const segments: SiegeSegment[] = [];
  const gates = Math.max(1, Math.min(3, fort.gates));
  const gateXs = Array.from({ length: gates }, (_, i) => ((i + 1) / (gates + 1) - 0.5) * w);
  const wallHp = fort.wallHp * (1 - fort.wallDamage * 0.7);
  const gateHp = fort.gateHp * (1 - fort.gateDamage * 0.8);
  // 南面:城門と、そのあいだの城壁(長い所は区切る)
  const cuts = [-w / 2, ...gateXs.flatMap((g) => [g - GATE_WIDTH / 2, g + GATE_WIDTH / 2]), w / 2];
  let n = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const isGate = i % 2 === 1;
    const len = cuts[i + 1] - cuts[i];
    const pieces = isGate ? 1 : Math.max(1, Math.round(len / 26));
    for (let k = 0; k < pieces; k++) {
      const pw = len / pieces;
      const hp = isGate ? gateHp : wallHp;
      segments.push({
        id: `s${n++}`, kind: isGate ? "gate" : "wall", south: true,
        x: cuts[i] + pw * (k + 0.5), z: SOUTH_Z, w: pw, d: thick, hp, maxHp: hp, scalable: 0,
      });
    }
  }
  // 東・西・北:一続きの城壁(この戦いでは攻めない面)
  const solid = (id: string, x: number, z: number, sw: number, sd: number): void => {
    segments.push({ id, kind: "wall", south: false, x, z, w: sw, d: sd, hp: 1e9, maxHp: 1e9, scalable: 0 });
  };
  solid("north", 0, SOUTH_Z - d, w + thick, thick);
  solid("west", -w / 2, cz, thick, d);
  solid("east", w / 2, cz, thick, d);
  const hasInner = !!layout.palaces?.some((p) => p.fortified) || !!layout.citadel;
  return {
    cx: 0, cz, w, d, wallHeight, thick, southZ: SOUTH_Z, segments,
    keep: { x: 0, z: cz - d * 0.12, r: Math.min(22, d * 0.22) },
    hasInner,
  };
}

/** その勢力・その年に、使える攻城兵器の数 */
function engineCount(id: "ram" | "catapult" | "siegeTower" | "ladder", factionId: string, year: number, total: number): number {
  const rule = (engineRules as unknown as Record<string, { count: number[]; fromYear: number; excludeFactions: string[] }>)[id];
  if (year < rule.fromYear || rule.excludeFactions.includes(factionId)) return 0;
  // 大軍ほど多くの兵器を持つ
  const t = Math.max(0, Math.min(1, (total - 3000) / 20000));
  return Math.round(rule.count[0] + (rule.count[1] - rule.count[0]) * t);
}

/**
 * 攻城戦の初期配置。
 * 攻撃側は野戦と同じ並びで城の南に布陣し、前に攻城兵器を置く。
 * 守備隊は、弓兵を城壁の上に、歩兵を城門の内側と中心部に置く。
 */
export function deploySiege(setup: BattleSetup, layout: SiegeLayout, year: number): Deployment {
  const base = deploy(setup);
  const attackers = base.units.filter((u) => u.side === "attacker");
  for (const u of attackers) u.z = Math.min(FIELD.depth / 2 - 6, u.z + 30);
  const units: BattleUnit[] = [...attackers];
  const template = attackers[0];
  const make = (
    side: BattleUnit["side"], classId: UnitClassId, name: string, men: number, x: number, z: number, extra: Partial<BattleUnit> = {},
  ): BattleUnit => {
    const u: BattleUnit = {
      ...template, id: `${side}-${classId}-${units.length}`, side, classId, name, men, maxMen: men, x, z,
      source: unitClasses[classId].category, isCommand: false, facing: side === "attacker" ? 0 : Math.PI,
      columns: 0, formation: "line", faceTo: null, elevation: 0, state: "idle", order: { kind: "hold" }, engaged: [],
      running: false, reloadLeft: 0, recentLoss: 0, calm: 99, escaped: false, ...extra,
    };
    shapeUnit(u, base.menPerFigure);
    units.push(u);
    return u;
  };

  // --- 攻城兵器:攻撃側の前に並べる ---
  const total = setup.attacker.troops.infantry + setup.attacker.troops.cavalry + setup.attacker.troops.archer;
  const engines: UnitClassId[] = [];
  for (const id of ["ram", "catapult", "siegeTower", "ladder"] as const) {
    for (let i = 0; i < engineCount(id, setup.attacker.factionId, year, total); i++) engines.push(id);
  }
  engines.forEach((id, i) => {
    const cls = unitClasses[id];
    const x = (i - (engines.length - 1) / 2) * 22;
    make("attacker", id, `${cls.name}${engines.filter((e, k) => e === id && k <= i).length}`, cls.durability ?? 200, x, layout.southZ + 62, {
      morale: setup.attacker.morale, baseMorale: setup.attacker.morale, fatigue: 0,
    });
  });

  // --- 守備隊 ---
  const def = setup.defender;
  const mood = { morale: def.morale, baseMorale: def.morale, fatigue: 0 };
  const south = layout.segments.filter((s) => s.south);
  const gates = south.filter((s) => s.kind === "gate");
  // 弓兵の4分の3を、南面の城壁と城門の上に配る。残りは中心部の予備
  const posts = south.length > 6 ? south.filter((_, i) => i % Math.ceil(south.length / 6) === 0) : south;
  const perPost = Math.floor((def.troops.archer * 0.75) / Math.max(1, posts.length));
  posts.forEach((seg, i) => {
    if (perPost < 20) return;
    make("defender", i % 3 === 2 ? "crossbowmen" : "archers", `城壁の${i % 3 === 2 ? "弩兵" : "弓兵"}${i + 1}`, perPost, seg.x, seg.z, {
      ...mood, elevation: layout.wallHeight, source: "archer",
    });
  });
  const spare = def.troops.archer - perPost * posts.length * (perPost < 20 ? 0 : 1);
  if (spare >= 20) make("defender", "archers", "予備の弓兵", spare, layout.keep.x + 16, layout.keep.z + 6, { ...mood, source: "archer" });
  // 歩兵:城門の内側に槍兵、中央に剣盾兵の予備、中心部に重装歩兵と本陣
  const guard = Math.min(def.troops.infantry, Math.max(30, Math.round(def.troops.infantry * 0.04)));
  const inf = def.troops.infantry - guard;
  const perGate = Math.floor((inf * 0.45) / gates.length);
  gates.forEach((g, i) => {
    if (perGate >= 20) make("defender", "spearmen", `城門の守備隊${i + 1}`, perGate, g.x, layout.southZ - 14, { ...mood, source: "infantry" });
  });
  const reserve = Math.floor(inf * 0.3);
  if (reserve >= 20) make("defender", "swordsmen", "予備隊", reserve, 0, layout.southZ - layout.d * 0.4, { ...mood, source: "infantry" });
  const core = inf - perGate * gates.length * (perGate >= 20 ? 1 : 0) - (reserve >= 20 ? reserve : 0);
  if (core >= 20) make("defender", "heavyInfantry", "内城の守備隊", core, layout.keep.x - 14, layout.keep.z + 6, { ...mood, source: "infantry" });
  if (def.troops.cavalry >= 20) make("defender", "lightCavalry", "城内の騎兵", def.troops.cavalry, layout.keep.x, layout.keep.z + 20, { ...mood, source: "cavalry" });
  if (guard > 0) {
    make("defender", "swordsmen", def.commander ? `${def.commander.name}本陣` : "守備隊本陣", guard, layout.keep.x, layout.keep.z, {
      ...mood, source: "infantry", isCommand: true,
    });
  }
  return { units, menPerFigure: base.menPerFigure };
}

export type SiegePhase = "包囲" | "攻城準備" | "城壁・城門への攻撃" | "突破" | "城内戦闘" | "中心部の攻略";

export class Siege {
  /** 経過した日数(小数) */
  day = 0;
  phase: SiegePhase = "包囲";
  attackerFood: number;
  defenderFood: number;
  /** 攻撃側が中心部を押さえ続けている秒数 */
  private holdTime = 0;
  private lastDay = 0;
  /** 壊された攻城兵器の数(結果や動作確認に使う) */
  enginesLost = 0;

  constructor(readonly layout: SiegeLayout, readonly setup: BattleSetup) {
    this.attackerFood = setup.attacker.food;
    this.defenderFood = setup.defender.food;
  }

  segment(id: string): SiegeSegment | undefined {
    return this.layout.segments.find((s) => s.id === id);
  }

  /** その場所が、まだ立っている城壁・城門の中か */
  blockedAt(x: number, z: number): boolean {
    for (const s of this.layout.segments) {
      if (s.hp > 0 && Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) return true;
    }
    return false;
  }

  /** タップした場所にある、攻められる城壁・城門(少し広めに拾う) */
  segmentAt(x: number, z: number): SiegeSegment | null {
    return this.layout.segments.find((s) => s.south && s.hp > 0 && Math.abs(x - s.x) <= s.w / 2 + 1 && Math.abs(z - s.z) <= s.d / 2 + 5) ?? null;
  }

  /** 城の中か */
  inside(x: number, z: number): boolean {
    const l = this.layout;
    return Math.abs(x - l.cx) < l.w / 2 && z < l.southZ && z > l.southZ - l.d;
  }

  /** 開いた突破口(壊れた城門・城壁) */
  passages(): SiegeSegment[] {
    return this.layout.segments.filter((s) => s.south && s.hp <= 0);
  }

  /**
   * 城の内と外をまたいで移動するときの、経由する地点。
   * いちばん近い突破口の正面にいったん並び、そこから通り抜ける。突破口がなければ null。
   */
  route(ux: number, uz: number, tx: number, tz: number): { x: number; z: number } | null {
    const from = this.inside(ux, uz);
    if (from === this.inside(tx, tz)) return null;
    let best: SiegeSegment | null = null;
    let bestD = Infinity;
    for (const p of this.passages()) {
      const d = Math.hypot(p.x - ux, p.z - uz) + Math.hypot(p.x - tx, p.z - tz);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return null;
    const out = from ? -1 : 1; // いまいる側(外なら南 = +z)
    const lined = Math.abs(ux - best.x) < best.w / 2 - 1.5;
    return { x: best.x, z: best.z + (lined ? -out : out) * 9 };
  }

  /** 城壁・城門を攻める部隊が、取り付く場所(その区画の外側の正面) */
  assaultPoint(u: BattleUnit, seg: SiegeSegment): { x: number; z: number } {
    return { x: Math.max(seg.x - seg.w / 2 + 2, Math.min(seg.x + seg.w / 2 - 2, u.x)), z: seg.z + seg.d / 2 + 2.5 + u.depth / 2 };
  }

  /** 城壁の上の敵に、どれだけ戦いを挑めるか(雲梯や櫓が取り付いていなければ 0) */
  escalade(wallUnit: BattleUnit): number {
    let best = 0;
    for (const s of this.layout.segments) {
      if (s.south && s.hp > 0 && Math.abs(wallUnit.x - s.x) <= s.w / 2 + 14) best = Math.max(best, s.scalable);
    }
    return best;
  }

  private damage(sim: BattleSim, seg: SiegeSegment, amount: number): void {
    if (seg.hp <= 0 || !seg.south) return;
    seg.hp -= amount;
    if (seg.hp > 0) return;
    seg.hp = 0;
    sim.fx.push({ kind: "breach", x: seg.x, z: seg.z });
    // その上にいた守備兵は、足場を失って城内へ落ち延びる
    for (const u of sim.units) {
      if (u.elevation > 0 && Math.abs(u.x - seg.x) <= seg.w / 2 + 1) {
        u.elevation = 0;
        u.z -= 9;
        u.men *= 0.85;
        u.morale -= 18;
      }
    }
    // 城が破られると、守る側は動揺し、攻める側は勢いづく
    for (const u of sim.units) {
      if (!sim.isActive(u)) continue;
      u.morale = Math.max(0, Math.min(100, u.morale + (u.side === "defender" ? -8 : 6)));
    }
  }

  /** 1コマ分の更新。戦闘が終わる条件を満たしたら、sim に決着を伝える */
  update(sim: BattleSim, dt: number): void {
    this.day += dt / SECONDS_PER_DAY;
    for (const s of this.layout.segments) s.scalable = 0;
    const l = this.layout;

    for (const u of sim.units) {
      if (!sim.isActive(u)) continue;
      const cls = unitClasses[u.classId];
      if (u.side !== "attacker" || u.order.kind !== "assault") continue;
      const seg = this.segment(u.order.segmentId);
      if (!seg || seg.hp <= 0) {
        u.order = { kind: "hold" };
        continue;
      }
      const p = this.assaultPoint(u, seg);
      const reach = Math.hypot(p.x - u.x, p.z - u.z);
      const crew = u.men / Math.max(1, u.maxMen); // 兵器は、壊れるほど働きが落ちる
      if (cls.siegeRange) {
        // 投石機:届く距離まで出て、石を飛ばす
        if (Math.hypot(seg.x - u.x, seg.z - u.z) <= cls.siegeRange) {
          this.damage(sim, seg, (seg.kind === "gate" ? cls.gateDamage ?? 0 : cls.wallDamage ?? 0) * crew * dt);
          if (Math.random() < dt / 3.5) {
            sim.fx.push({ kind: "volley", fromX: u.x, fromZ: u.z, toX: seg.x, toZ: seg.z, flight: 2.4, count: 1, toY: l.wallHeight * 0.6, stone: true });
          }
        }
      } else if (reach < 3.5) {
        if (cls.escalade) seg.scalable = Math.max(seg.scalable, cls.escalade);
        else if (cls.engine) this.damage(sim, seg, (seg.kind === "gate" ? cls.gateDamage ?? 0 : 0) * crew * dt);
        // 歩兵が城門に取り付いて、斧や槌で打ち破ろうとする(衝車よりずっと遅い)
        else if (seg.kind === "gate" && cls.category === "infantry") this.damage(sim, seg, 1.4 * Math.min(1.5, u.men / 800) * dt);
        if ((cls.engine && !cls.escalade) || seg.kind === "gate") {
          if (Math.random() < dt * 0.5) sim.fx.push({ kind: "dust", x: u.x, z: seg.z + seg.d / 2 });
        }
      }
    }

    // --- 1日ごと:食糧と士気、降伏の判断 ---
    const today = Math.floor(this.day);
    if (today > this.lastDay) {
      this.lastDay = today;
      this.attackerFood = Math.max(0, this.attackerFood - 1);
      this.defenderFood = Math.max(0, this.defenderFood - 1);
      for (const u of sim.units) {
        if (!sim.isActive(u)) continue;
        const starving = (u.side === "attacker" ? this.attackerFood : this.defenderFood) <= 0;
        // 食糧が尽きた側は、日ごとに士気が大きく下がる。囲まれている守備隊も、少しずつ消耗する
        u.morale = Math.max(0, u.morale - (starving ? 4 : u.side === "defender" ? 0.25 : 0.1));
        u.baseMorale = Math.max(10, u.baseMorale - (starving ? 3 : 0));
      }
      if (this.wantsSurrender(sim)) {
        sim.finishWith("attacker", "surrendered");
        return;
      }
    }

    // --- 段階 ---
    const breached = this.passages().length > 0;
    const attackersIn = sim.units.some((u) => u.side === "attacker" && sim.isActive(u) && this.inside(u.x, u.z));
    const assaulting = sim.units.some((u) => u.side === "attacker" && u.order.kind === "assault" && sim.isActive(u));
    const nearKeep = sim.units.some((u) => u.side === "attacker" && sim.isActive(u) && Math.hypot(u.x - l.keep.x, u.z - l.keep.z) < l.keep.r + 18);
    this.phase = nearKeep ? "中心部の攻略" : attackersIn ? "城内戦闘" : breached ? "突破" : assaulting ? (this.day < 0.4 ? "攻城準備" : "城壁・城門への攻撃") : "包囲";

    // --- 陥落:攻撃側が中心部を押さえ、近くに守備兵がいない状態が続く ---
    const holder = sim.units.some(
      (u) => u.side === "attacker" && sim.isActive(u) && !unitClasses[u.classId].engine && Math.hypot(u.x - l.keep.x, u.z - l.keep.z) < l.keep.r,
    );
    const contested = sim.units.some((u) => u.side === "defender" && sim.isActive(u) && Math.hypot(u.x - l.keep.x, u.z - l.keep.z) < l.keep.r + 8);
    this.holdTime = holder && !contested ? this.holdTime + dt : 0;
    if (this.holdTime > 12) sim.finishWith("attacker", "captured");
  }

  /** 守将の判断:士気が崩れた、食糧が尽きた、城が破られて兵がわずか、のいずれかで降伏する */
  private wantsSurrender(sim: BattleSim): boolean {
    const mine = sim.units.filter((u) => u.side === "defender" && sim.isActive(u));
    if (mine.length === 0) return false;
    const men = mine.reduce((s, u) => s + u.men, 0);
    const morale = mine.reduce((s, u) => s + u.morale * u.men, 0) / Math.max(1, men);
    const left = men / Math.max(1, sim.initialMenOf("defender"));
    const outnumbered = sim.menOf("attacker", true) > men * 3;
    if (morale < 22) return true;
    if (this.defenderFood <= 0 && morale < 45) return true;
    return this.passages().length > 0 && left < 0.3 && outnumbered && morale < 50;
  }

  /** 画面に出す、日数と段階 */
  statusText(): string {
    return `${Math.floor(this.day) + 1}日目・${this.phase}`;
  }

  /** 攻城戦の結末(結果画面と、戦略マップへの反映に使う) */
  outcome(captured: boolean): SiegeOutcome {
    const south = this.layout.segments.filter((s) => s.south);
    const lost = (kind: "wall" | "gate"): number => {
      const list = south.filter((s) => s.kind === kind);
      return list.reduce((sum, s) => sum + (1 - Math.max(0, s.hp) / s.maxHp), 0) / Math.max(1, list.length);
    };
    return {
      cityId: this.setup.defender.cityId ?? "", captured, days: Math.floor(this.day) + 1,
      wallDamage: lost("wall"), gateDamage: lost("gate"), foodLeft: Math.round(this.defenderFood),
    };
  }
}
