// 敵軍(自動で動く側)の判断。兵力・士気・地形から「攻める・守る・退く」を決め、兵種ごとに役割を与える。
// 難易度ごとの調整は data/rules/battleAi.json にある。
import aiData from "../data/rules/battleAi.json";
import type { BattleSim } from "./BattleSim";
import { unitClasses } from "./deploy";
import type { BattleUnit, SideId } from "./types";

export type Difficulty = "veryEasy" | "easy" | "normal" | "hard" | "veryHard";

interface AiProfile {
  name: string;
  /** 何秒ごとに判断し直すか */
  thinkSeconds: number;
  /** 攻めに出るのに必要な優勢の度合い(小さいほど積極的) */
  aggression: number;
  /** 戦える兵がこの割合を下回ると、全軍で退く(0 なら退かない) */
  retreatBelow: number;
  /** 騎兵が側面・背後へ回り込むか */
  flanking: boolean;
  /** 弓兵が敵から距離を取るか */
  kiting: boolean;
  /** 状況に応じて陣形を変えるか */
  formations: boolean;
  /** 開戦から、これだけの秒数は陣を構えて待つ */
  holdSeconds: number;
}

const PROFILES = aiData as Record<Difficulty, AiProfile>;

export type Posture = "hold" | "attack" | "defend" | "retreat";

export class BattleAi {
  readonly profile: AiProfile;
  /** いまの方針(画面には出さないが、動作確認で見られるようにしてある) */
  posture: Posture = "hold";
  private timer = 0;
  /** 回り込み中の騎兵が、いま目指している地点 */
  private readonly flankPoints = new Map<string, { x: number; z: number; targetId: string }>();

  constructor(readonly side: SideId, difficulty: Difficulty) {
    this.profile = PROFILES[difficulty];
  }

  update(sim: BattleSim, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.profile.thinkSeconds;
    this.think(sim);
  }

  /** 軍の強さの目安:戦える兵の数に、士気と疲労を掛ける */
  private strength(sim: BattleSim, side: SideId): number {
    let s = 0;
    for (const u of sim.units) {
      if (u.side === side && sim.isActive(u)) s += u.men * (0.5 + u.morale / 200) * (1 - u.fatigue / 300);
    }
    return s;
  }

  private think(sim: BattleSim): void {
    const p = this.profile;
    const foe: SideId = this.side === "attacker" ? "defender" : "attacker";
    const mine = sim.units.filter((u) => u.side === this.side && sim.isActive(u) && u.state !== "retreating");
    if (mine.length === 0) return;
    const ratio = this.strength(sim, this.side) / Math.max(1, this.strength(sim, foe));
    const left = sim.menOf(this.side, true) / Math.max(1, sim.initialMenOf(this.side));

    // --- 方針を決める ---
    const enemyClose = mine.some((u) => {
      const e = sim.nearestEnemy(u);
      return e !== null && Math.hypot(e.x - u.x, e.z - u.z) < 75;
    });
    const hurt = mine.some((u) => u.men < u.maxMen * 0.96);
    // 高い所に陣取っているときは、有利な地形を捨てずに守る
    const foes = sim.units.filter((u) => u.side === foe && sim.isActive(u));
    const avg = (list: BattleUnit[]): number => list.reduce((s, u) => s + sim.field.heightAt(u.x, u.z), 0) / Math.max(1, list.length);
    const highGround = avg(mine) - avg(foes) > 2.5;
    if (p.retreatBelow > 0 && left < p.retreatBelow && ratio < 0.55) this.posture = "retreat";
    else if (ratio >= p.aggression && (sim.time > p.holdSeconds || enemyClose || hurt)) this.posture = highGround && !hurt && !enemyClose ? "defend" : "attack";
    else if (sim.time > p.holdSeconds || enemyClose || hurt) this.posture = "defend";
    else this.posture = "hold";

    if (this.posture === "retreat") {
      sim.retreatAll(this.side);
      return;
    }
    if (this.posture === "hold") return;

    const foeCavalry = foes.filter((u) => unitClasses[u.classId].category === "cavalry");
    for (const u of mine) {
      const cls = unitClasses[u.classId];
      const nearest = sim.nearestEnemy(u, (e) => e.state !== "routing") ?? sim.nearestEnemy(u);
      if (!nearest) continue;
      const dist = Math.hypot(nearest.x - u.x, nearest.z - u.z);

      // 士気が崩れかけた部隊は、いったん下がって立て直す
      if (u.morale < 28 && u.engaged.length === 0 && !u.isCommand) {
        sim.command(u.id, { kind: "move", x: u.x, z: u.z + (this.side === "attacker" ? 30 : -30) });
        continue;
      }

      // 本陣は、近くまで攻め込まれない限り後ろで構える
      if (u.isCommand) {
        if (dist < 28 || ratio > 2.2) sim.command(u.id, { kind: "attack", targetId: nearest.id });
        continue;
      }

      if (cls.category === "archer") {
        // 弓兵:敵が迫ってきたら下がって距離を取り、そうでなければ射程まで出て撃つ
        if (p.kiting && dist < 20 && u.engaged.length === 0 && unitClasses[nearest.classId].category !== "archer") {
          const dx = u.x - nearest.x;
          const dz = u.z - nearest.z;
          const len = Math.hypot(dx, dz) || 1;
          sim.command(u.id, { kind: "move", x: u.x + (dx / len) * 28, z: u.z + (dz / len) * 28 });
        } else if (this.posture === "attack" || dist < (cls.range ?? 60) * 1.4) {
          sim.command(u.id, { kind: "attack", targetId: nearest.id });
        }
        continue;
      }

      if (cls.category === "cavalry") {
        if (p.formations && u.formation !== "wedge" && u.engaged.length === 0) sim.setFormation(u.id, "wedge");
        if (this.posture === "defend" && dist > 70) continue; // 守るときは、敵が近づくまで温存する
        const target = this.pickCavalryTarget(sim, u, foes);
        if (!target) continue;
        if (p.flanking && u.engaged.length === 0 && this.flank(sim, u, target)) continue;
        sim.command(u.id, { kind: "attack", targetId: target.id });
        continue;
      }

      // 歩兵:槍兵は、敵の騎兵が迫ったら方陣を組んで備える
      if (p.formations && u.classId === "spearmen") {
        const threat = foeCavalry.some((c) => Math.hypot(c.x - u.x, c.z - u.z) < 42);
        const want = threat ? "square" : "line";
        if (u.formation !== want && (u.engaged.length === 0 || threat)) sim.setFormation(u.id, want);
      }
      if (this.posture === "attack" || dist < 48) sim.command(u.id, { kind: "attack", targetId: nearest.id });
    }
  }

  /** 騎兵の狙い:弓兵や、すでに戦っている敵(側面を突ける)を優先し、槍兵の正面は避ける */
  private pickCavalryTarget(sim: BattleSim, u: BattleUnit, foes: BattleUnit[]): BattleUnit | null {
    let best: BattleUnit | null = null;
    let bestScore = Infinity;
    const standing = foes.filter((e) => e.state !== "routing");
    for (const e of standing.length > 0 ? standing : sim.enemiesOf(u)) {
      const score =
        Math.hypot(e.x - u.x, e.z - u.z) -
        (unitClasses[e.classId].category === "archer" ? 45 : 0) -
        (e.engaged.length > 0 ? 30 : 0) +
        (e.classId === "spearmen" ? 35 : 0) + (e.formation === "square" ? 40 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /**
   * 回り込み:敵の横から背後へ抜ける地点へ先に走り、そこから突撃する。
   * 回り込みの途中なら true を返す。
   */
  private flank(sim: BattleSim, u: BattleUnit, target: BattleUnit): boolean {
    const dist = Math.hypot(target.x - u.x, target.z - u.z);
    let point = this.flankPoints.get(u.id);
    if (point && point.targetId !== target.id) point = undefined;
    if (!point) {
      if (dist < 40) return false; // もう近いので、そのまま突っ込む
      // 敵の背後(敵が向いているのと反対側)で、自分に近い側の横へずらした地点
      const backX = -Math.sin(target.facing);
      const backZ = Math.cos(target.facing);
      const side = (u.x - target.x) * Math.cos(target.facing) + (u.z - target.z) * Math.sin(target.facing) >= 0 ? 1 : -1;
      point = {
        x: target.x + backX * 26 + Math.cos(target.facing) * side * (target.width / 2 + 24),
        z: target.z + backZ * 26 + Math.sin(target.facing) * side * (target.width / 2 + 24),
        targetId: target.id,
      };
      this.flankPoints.set(u.id, point);
    }
    if (Math.hypot(point.x - u.x, point.z - u.z) < 14 || dist < 22) {
      this.flankPoints.delete(u.id);
      return false;
    }
    sim.command(u.id, { kind: "move", x: point.x, z: point.z });
    return true;
  }
}
