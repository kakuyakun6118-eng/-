// 会戦の計算。部隊の移動、接近戦、突撃、射撃、士気、敗走、勝敗の判定を行う。
// ここは計算だけで、3Dの見た目は知らない。見た目用の出来事(矢の斉射など)は fx にためて渡す。
import type { BattleSetup } from "../data/types";
import { FIELD, shapeUnit, unitClasses, type Deployment } from "./deploy";
import type { FieldMap } from "./fieldData";
import { buildResult } from "./result";
import type { BattleFx, BattleResult, BattleUnit, SideId, UnitOrder } from "./types";

/** 接近戦の損害の基本の大きさ */
const MELEE_RATE = 0.005;
/** 射撃の損害の基本の大きさ */
const MISSILE_RATE = 0.011;
/** 士気がこれ以下になると敗走する */
const ROUT_MORALE = 12;
/** 戦える兵がこの割合を下回ると、主力が崩れたとみなして全軍が敗走する */
const BREAK_RATIO = 0.18;
/** 戦闘の時間切れ(秒) */
const TIME_LIMIT = 1500;

interface Commander {
  leadership: number;
  valor: number;
  intelligence: number;
  /** 指揮官が健在か(本陣が崩れると false) */
  active: boolean;
}

interface PendingVolley {
  at: number;
  targetId: string;
  casualties: number;
}

const other = (s: SideId): SideId => (s === "attacker" ? "defender" : "attacker");

export class BattleSim {
  time = 0;
  readonly units: BattleUnit[];
  readonly menPerFigure: number;
  /** 見た目用の出来事。表示側が読んだら空にする */
  fx: BattleFx[] = [];
  /** 決着したら入る */
  result: BattleResult | null = null;
  private readonly commanders: Record<SideId, Commander>;
  private readonly initialMen: Record<SideId, number>;
  private readonly volleys: PendingVolley[] = [];
  private thinkTimer = 0;
  private checkTimer = 0;
  /** 自動で動く側が、前進を始めたか */
  private aiAdvancing = false;
  /** 突撃の衝撃を最後に与えた時刻(同じ相手に、触れるたびに何度も衝撃が入らないようにする) */
  private readonly lastImpact = new Map<string, number>();

  constructor(
    readonly setup: BattleSetup, deployment: Deployment, readonly field: FieldMap,
    /** プレイヤーが指揮する側。もう一方は自動で動く */
    readonly playerSide: SideId,
  ) {
    this.units = deployment.units;
    this.menPerFigure = deployment.menPerFigure;
    const commander = (id: SideId): Commander => {
      const c = (id === "attacker" ? setup.attacker : setup.defender).commander;
      return { leadership: c?.leadership ?? 45, valor: c?.valor ?? 45, intelligence: c?.intelligence ?? 45, active: true };
    };
    this.commanders = { attacker: commander("attacker"), defender: commander("defender") };
    this.initialMen = { attacker: this.menOf("attacker", false), defender: this.menOf("defender", false) };
  }

  unit(id: string): BattleUnit | undefined {
    return this.units.find((u) => u.id === id);
  }

  /** その部隊が、まだ命令を受けて戦える状態か */
  isActive(u: BattleUnit): boolean {
    return u.state !== "gone" && u.state !== "routing" && !u.escaped && u.men > 0;
  }

  /** 陣営の兵力。activeOnly なら、敗走中や退場した部隊を除く */
  menOf(side: SideId, activeOnly: boolean): number {
    return this.units
      .filter((u) => u.side === side && (activeOnly ? this.isActive(u) : !u.escaped))
      .reduce((s, u) => s + u.men, 0);
  }

  initialMenOf(side: SideId): number {
    return this.initialMen[side];
  }

  /** 部隊に命令を出す。敗走中の部隊は命令を受け付けない */
  order(unitId: string, order: UnitOrder): boolean {
    const u = this.unit(unitId);
    if (!u || !this.isActive(u)) return false;
    u.order = order;
    if (order.kind === "retreat") u.state = "retreating";
    else if (u.state === "retreating") u.state = "idle";
    return true;
  }

  /** 全軍撤退:その場で戦闘を終える。背を向けて退くので、追撃で損害が出る */
  retreatAll(side: SideId): void {
    if (this.result) return;
    const enemyCavalry = this.units
      .filter((u) => u.side === other(side) && this.isActive(u) && unitClasses[u.classId].category === "cavalry")
      .reduce((s, u) => s + u.men, 0);
    const pursuit = 0.05 + 0.12 * Math.min(1, enemyCavalry / Math.max(1, this.menOf(side, true)));
    for (const u of this.units) {
      if (u.side !== side || u.men <= 0) continue;
      u.men = Math.round(u.men * (1 - pursuit));
      u.escaped = true;
      u.state = "gone";
    }
    this.finish(other(side), "retreated");
  }

  // ===== 位置や向きの計算 =====

  /** ある点から、部隊の隊列(長方形)までの距離 */
  private distanceToBox(u: BattleUnit, px: number, pz: number): number {
    const dx = px - u.x;
    const dz = pz - u.z;
    const cos = Math.cos(u.facing);
    const sin = Math.sin(u.facing);
    // 部隊から見て、右方向と前方向の成分に分ける
    const right = dx * cos + dz * sin;
    const forward = dx * sin - dz * cos;
    const ox = Math.max(0, Math.abs(right) - u.width / 2);
    const oz = Math.max(0, Math.abs(forward) - u.depth / 2);
    return Math.hypot(ox, oz);
  }

  /** 2つの部隊のあいだのすき間 */
  gap(a: BattleUnit, b: BattleUnit): number {
    return Math.min(
      this.distanceToBox(a, b.x, b.z) - Math.min(b.width, b.depth) / 2,
      this.distanceToBox(b, a.x, a.z) - Math.min(a.width, a.depth) / 2,
    );
  }

  /** 守る側から見て、攻める側がどの方向にいるか。正面 1 / 側面 1.5 / 背後 2 */
  private flankFactor(attacker: BattleUnit, defender: BattleUnit): number {
    const dx = attacker.x - defender.x;
    const dz = attacker.z - defender.z;
    const len = Math.hypot(dx, dz) || 1;
    const cos = (dx * Math.sin(defender.facing) - dz * Math.cos(defender.facing)) / len;
    if (cos > 0.3) return 1;
    return cos > -0.5 ? 1.5 : 2;
  }

  private enemiesOf(u: BattleUnit): BattleUnit[] {
    return this.units.filter((e) => e.side !== u.side && e.state !== "gone" && !e.escaped && e.men > 0);
  }

  private nearestEnemy(u: BattleUnit, filter?: (e: BattleUnit) => boolean): BattleUnit | null {
    let best: BattleUnit | null = null;
    let bestD = Infinity;
    for (const e of this.enemiesOf(u)) {
      if (filter && !filter(e)) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ===== 1コマ分の更新 =====

  update(dt: number): void {
    if (this.result) return;
    // 細かく刻んで計算する(早送りでも結果が荒れないように)
    let left = Math.min(dt, 1);
    while (left > 0 && !this.result) {
      const step = Math.min(left, 0.1);
      this.step(step);
      left -= step;
    }
  }

  private step(dt: number): void {
    this.time += dt;
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 1;
      this.think();
    }
    for (const u of this.units) {
      if (u.state === "gone" || u.escaped) continue;
      this.move(u, dt);
    }
    this.separate();
    this.findEngagements();
    for (const u of this.units) {
      if (u.state === "gone" || u.escaped) continue;
      this.fight(u, dt);
    }
    this.landVolleys();
    for (const u of this.units) {
      if (u.state === "gone" || u.escaped) continue;
      this.updateMorale(u, dt);
      shapeUnit(u, this.menPerFigure);
    }
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 0.5;
      this.checkCommanders();
      this.checkEnd();
    }
  }

  /** 自動で動く側の判断と、「追撃」を命じられた部隊の目標選び */
  private think(): void {
    const ai = other(this.playerSide);
    const aiUnits = this.units.filter((u) => u.side === ai && this.isActive(u));
    // 守る側は、しばらく陣を構えて待つ。敵が近づくか、損害が出たら前に出る
    const hold = this.setup.terrain === "hill" || this.setup.terrain === "mountain" ? 60 : 25;
    if (!this.aiAdvancing) {
      const close = aiUnits.some((u) => {
        const e = this.nearestEnemy(u);
        return e !== null && Math.hypot(e.x - u.x, e.z - u.z) < 80;
      });
      if (this.time > hold || close || aiUnits.some((u) => u.men < u.maxMen * 0.97)) this.aiAdvancing = true;
    }
    const strength = this.menOf(ai, true) / Math.max(1, this.initialMen[ai]);

    for (const u of this.units) {
      if (!this.isActive(u) || u.state === "retreating") continue;
      const auto = u.side === ai;
      if (!auto && u.order.kind !== "pursue") continue;
      if (auto && !this.aiAdvancing) continue;
      const category = unitClasses[u.classId].category;
      let target: BattleUnit | null = null;
      if (auto && u.isCommand && strength > 0.5) {
        // 本陣は、近くまで攻め込まれない限り後ろで構える
        const e = this.nearestEnemy(u);
        if (e && Math.hypot(e.x - u.x, e.z - u.z) < 30) target = e;
      } else if (category === "cavalry") {
        // 騎兵は、弓兵や、すでに戦っている敵(側面を突ける)を優先して狙う
        let bestScore = Infinity;
        for (const e of this.enemiesOf(u)) {
          if (e.state === "routing" && !this.enemiesOf(u).every((k) => k.state === "routing")) continue;
          const score =
            Math.hypot(e.x - u.x, e.z - u.z) -
            (unitClasses[e.classId].category === "archer" ? 45 : 0) -
            (e.engaged.length > 0 ? 25 : 0) +
            (e.classId === "spearmen" ? 30 : 0);
          if (score < bestScore) {
            bestScore = score;
            target = e;
          }
        }
      } else {
        target = this.nearestEnemy(u, (e) => e.state !== "routing") ?? this.nearestEnemy(u);
      }
      if (target) u.order = auto ? { kind: "attack", targetId: target.id } : { kind: "pursue", targetId: target.id };
    }
  }

  /** その部隊が、いま向かうべき相手(攻撃や追撃の目標) */
  private targetOf(u: BattleUnit): BattleUnit | null {
    const id = u.order.kind === "attack" || u.order.kind === "pursue" ? u.order.targetId : undefined;
    const t = id ? this.unit(id) : undefined;
    if (!t || t.state === "gone" || t.escaped || t.men <= 0) {
      if (u.order.kind === "attack") u.order = { kind: "hold" };
      return null;
    }
    return t;
  }

  private move(u: BattleUnit, dt: number): void {
    const cls = unitClasses[u.classId];
    const fleeing = u.state === "routing" || u.state === "retreating";
    const homeZ = (u.side === "attacker" ? 1 : -1) * (FIELD.depth / 2 + 12);
    let tx = u.x;
    let tz = u.z;
    let wantRun = false;
    let moving = false;
    const target = fleeing ? null : this.targetOf(u);

    if (fleeing) {
      tz = homeZ;
      moving = true;
      wantRun = u.state === "routing";
    } else if (u.order.kind === "move") {
      tx = u.order.x;
      tz = u.order.z;
      moving = Math.hypot(tx - u.x, tz - u.z) > 1.5;
      if (!moving) u.order = { kind: "hold" };
    } else if (target) {
      const d = Math.hypot(target.x - u.x, target.z - u.z);
      if (cls.range && u.engaged.length === 0) {
        // 弓兵・弩兵は、射程に入ったら止まって撃つ
        moving = d > cls.range * 0.85;
      } else {
        moving = u.engaged.length === 0 || !u.engaged.includes(target.id);
        wantRun = d < 48; // 近づいたら走って突撃する
      }
      tx = target.x;
      tz = target.z;
    }
    // 接近戦の最中は、離れる命令(移動・撤退)のとき以外は動かない
    if (u.engaged.length > 0 && !fleeing && u.order.kind !== "move") moving = false;

    const water = this.field.waterAt(u.x, u.z);
    const forest = this.field.inForest(u.x, u.z);
    const cavalry = cls.category === "cavalry";
    const slope = this.field.slopeAt(u.x, u.z);
    // 騎兵は、斜面(約14度以上)では駆けられない。突撃もできなくなる
    u.running =
      moving && wantRun && u.fatigue < 88 && water === 0 && (u.engaged.length === 0 || fleeing) && !(cavalry && slope > 0.25);
    if (moving) {
      let speed = u.running ? cls.run : cls.walk;
      if (water > 0) speed *= water >= 1 ? 0.45 : 0.7;
      if (forest) speed *= cls.category === "cavalry" ? 0.55 : 0.8;
      speed *= 1 - 0.3 * (u.fatigue / 100);
      // 斜面では遅くなる。騎兵は歩兵より大きく遅くなる
      speed *= Math.max(0.3, 1 - slope * (cavalry ? 2.2 : 1.4));
      let dx = tx - u.x;
      let dz = tz - u.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      // 進む先が深い水や急斜面なら、左右へ向きを変えて通れる所を探す(谷や崖のふちに沿って回り込む)。
      // どちらにも進めなければ、その場で止まる
      const probe = 7;
      let open = this.field.blocked(u.x, u.z, cavalry); // すでに入り込んでいる場合は、そのまま抜け出させる
      if (!open) {
        for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          const nx = dx * cos - dz * sin;
          const nz = dx * sin + dz * cos;
          if (this.field.blocked(u.x + nx * probe, u.z + nz * probe, cavalry)) continue;
          dx = nx;
          dz = nz;
          open = true;
          break;
        }
      }
      const stepLen = open ? Math.min(len, speed * dt) : 0;
      u.x += dx * stepLen;
      u.z += dz * stepLen;
      this.turnToward(u, Math.atan2(dx, -dz), dt);
      if (u.state !== "routing" && u.state !== "retreating") u.state = "moving";
      u.fatigue = Math.min(100, u.fatigue + (u.running ? 0.55 : 0.12) * dt);
    } else {
      if (u.state === "moving") u.state = "idle";
      const face = u.engaged.length > 0 ? this.unit(u.engaged[0]) : target;
      if (face) this.turnToward(u, Math.atan2(face.x - u.x, -(face.z - u.z)), dt);
      if (u.engaged.length === 0) u.fatigue = Math.max(0, u.fatigue - 0.4 * dt);
    }

    // 戦場の端。逃げる部隊は、自軍の後方の端から退場する
    u.x = Math.max(-FIELD.width / 2 + 4, Math.min(FIELD.width / 2 - 4, u.x));
    if (fleeing && Math.abs(u.z) > FIELD.depth / 2 + 6) {
      u.escaped = true;
      u.engaged = [];
      return;
    }
    if (!fleeing) u.z = Math.max(-FIELD.depth / 2 + 4, Math.min(FIELD.depth / 2 - 4, u.z));
  }

  private turnToward(u: BattleUnit, angle: number, dt: number): void {
    let diff = angle - u.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const max = (u.state === "routing" ? 4 : 2.2) * dt;
    u.facing += Math.max(-max, Math.min(max, diff));
  }

  /** 味方どうしが重ならないよう、少しずつ押し離す */
  private separate(): void {
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.state === "gone" || a.escaped || a.state === "routing") continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        if (b.side !== a.side || b.state === "gone" || b.escaped || b.state === "routing") continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const need = (Math.min(a.width, a.depth * 2.5) + Math.min(b.width, b.depth * 2.5)) / 2;
        if (d < need) {
          const push = (need - d) * 0.06;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  /** 触れ合った敵どうしを、接近戦の相手として記録する。走って突っ込んだ側は突撃の衝撃を与える */
  private findEngagements(): void {
    const previous = new Map(this.units.map((u) => [u.id, u.engaged]));
    for (const u of this.units) u.engaged = [];
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.state === "gone" || a.escaped || a.men <= 0) continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        if (b.side === a.side || b.state === "gone" || b.escaped || b.men <= 0) continue;
        if (Math.abs(a.x - b.x) > 90 || Math.abs(a.z - b.z) > 90) continue;
        if (this.gap(a, b) > 1.6) continue;
        a.engaged.push(b.id);
        b.engaged.push(a.id);
        if (!previous.get(a.id)!.includes(b.id)) {
          this.impact(a, b);
          this.impact(b, a);
        }
      }
    }
  }

  /** 突撃の衝撃:走って敵にぶつかった瞬間の損害と、士気への打撃 */
  private impact(attacker: BattleUnit, defender: BattleUnit): void {
    if (!attacker.running || attacker.state === "routing") return;
    const key = `${attacker.id}>${defender.id}`;
    if (this.time - (this.lastImpact.get(key) ?? -99) < 20) return;
    this.lastImpact.set(key, this.time);
    const cls = unitClasses[attacker.classId];
    const dcls = unitClasses[defender.classId];
    const flank = this.flankFactor(attacker, defender);
    let power = cls.charge;
    if (this.field.inForest(defender.x, defender.z)) power *= 0.4; // 森では勢いが付かない
    if (this.field.slopeAt(defender.x, defender.z) > 0.2) power *= 0.5; // 斜面でも勢いが付かない
    if (this.field.heightAt(attacker.x, attacker.z) < this.field.heightAt(defender.x, defender.z) - 1.5) power *= 0.7;
    // 槍兵は、正面からの騎兵の突撃を受け止める
    if (cls.category === "cavalry" && flank === 1) power /= dcls.antiCavalry * 1.4;
    const casualties = Math.min(defender.men * 0.12, attacker.men * power * 0.004 * flank * (1 - dcls.armor * 0.4));
    this.hurt(defender, casualties);
    defender.morale -= Math.min(14, power * 0.35 * flank);
    if (power > 5) this.fx.push({ kind: "impact", x: (attacker.x + defender.x) / 2, z: (attacker.z + defender.z) / 2 });
  }

  /** 損害を与える */
  private hurt(u: BattleUnit, casualties: number): void {
    if (casualties <= 0 || u.men <= 0) return;
    const lost = Math.min(u.men, casualties);
    u.men -= lost;
    u.recentLoss += lost / Math.max(1, u.maxMen);
    u.calm = 0;
    if (u.men < 1) {
      u.men = 0;
      u.state = "gone";
      u.engaged = [];
    }
  }

  /** 戦闘能力への補正:士気・疲労・指揮官の統率 */
  private condition(u: BattleUnit): number {
    const c = this.commanders[u.side];
    const lead = c.active ? 1 + c.leadership / 500 : 0.92;
    const valor = u.isCommand ? 1 + c.valor / 250 : 1; // 武勇は、本人のいる本陣に効く
    return (0.6 + 0.4 * (u.morale / 100)) * (1 - 0.35 * (u.fatigue / 100)) * lead * valor;
  }

  private fight(u: BattleUnit, dt: number): void {
    const cls = unitClasses[u.classId];
    if (u.engaged.length > 0) {
      // --- 接近戦 ---
      if (u.state !== "routing" && u.state !== "retreating") u.state = "melee";
      u.fatigue = Math.min(100, u.fatigue + 0.8 * dt);
      const share = 1 / u.engaged.length;
      for (const id of u.engaged) {
        const e = this.unit(id);
        if (!e || e.men <= 0) continue;
        const ecls = unitClasses[e.classId];
        // 前の2列ほどが戦える。相手より極端に多くても、全員は戦えない
        const front = u.columns * this.menPerFigure * 2;
        const engaged = Math.min(u.men, front, e.men * 1.5) * share;
        let mult = this.condition(u) * this.flankFactor(u, e);
        // 知略の高い指揮官の下では、側面や背後を突かれても崩れにくい
        const smart = this.commanders[e.side];
        if (smart.active && this.flankFactor(u, e) > 1) mult *= 1 - smart.intelligence / 400;
        if (ecls.category === "cavalry") mult *= cls.antiCavalry;
        if (cls.category === "cavalry" && ecls.category === "archer") mult *= 1.4;
        if (cls.category === "cavalry" && this.field.inForest(u.x, u.z)) mult *= 0.65;
        if (this.field.waterAt(u.x, u.z) > 0) mult *= 0.75; // 川の中では陣形が乱れる
        const dh = this.field.heightAt(u.x, u.z) - this.field.heightAt(e.x, e.z);
        if (dh > 1.5) mult *= 1.15; // 高所から攻め下ろす
        else if (dh < -1.5) mult *= 0.88;
        if (u.state === "routing") mult *= 0.25; // 逃げながらでは、ほとんど戦えない
        if (e.state === "routing") mult *= 1.5; // 背を向けた敵は討ちやすい
        this.hurt(e, engaged * MELEE_RATE * (cls.melee / ecls.defense) * mult * dt);
      }
      return;
    }

    // --- 射撃(弓兵・弩兵。動いていないときに、射程内の敵を撃つ) ---
    if (!cls.range || !cls.reload || !cls.missile) return;
    if (u.state === "routing" || u.state === "retreating" || u.state === "moving") return;
    u.reloadLeft -= dt;
    if (u.reloadLeft > 0) return;
    const ordered = this.targetOf(u);
    const inRange = (e: BattleUnit): boolean => Math.hypot(e.x - u.x, e.z - u.z) <= cls.range!;
    // 味方と斬り合っている敵は避ける(味方に当たるため)。ほかに的がなければ撃つ
    const target =
      (ordered && inRange(ordered) ? ordered : null) ??
      this.nearestEnemy(u, (e) => inRange(e) && e.engaged.length === 0 && e.state !== "routing") ??
      this.nearestEnemy(u, (e) => inRange(e) && e.state !== "routing");
    if (!target) {
      u.reloadLeft = 0.5;
      if (u.state === "shooting") u.state = "idle";
      return;
    }
    u.state = "shooting";
    u.reloadLeft = cls.reload * (0.9 + 0.2 * Math.random());
    u.fatigue = Math.min(100, u.fatigue + 0.6);
    const tcls = unitClasses[target.classId];
    const d = Math.hypot(target.x - u.x, target.z - u.z);
    const c = this.commanders[u.side];
    let hit = cls.missile * MISSILE_RATE * this.condition(u);
    hit *= 1 - tcls.armor * (cls.piercing ? 0.45 : 0.85); // 弩は防具を貫きやすい
    hit *= 1 - 0.35 * (d / cls.range); // 遠いほど当たりにくい
    if (this.field.inForest(target.x, target.z)) hit *= 0.55; // 森は矢を防ぐ
    if (target.engaged.length > 0) hit *= 0.5;
    if (c.active) hit *= 1 + c.intelligence / 400; // 知略:射撃の統制
    if (this.field.heightAt(u.x, u.z) > this.field.heightAt(target.x, target.z) + 1.5) hit *= 1.15;
    const flight = 0.6 + d / 45;
    this.volleys.push({ at: this.time + flight, targetId: target.id, casualties: u.men * hit });
    this.fx.push({
      kind: "volley", fromX: u.x, fromZ: u.z, toX: target.x, toZ: target.z, flight,
      count: Math.max(3, Math.min(14, Math.round(u.men / this.menPerFigure / 4))),
    });
    this.turnToward(u, Math.atan2(target.x - u.x, -(target.z - u.z)), 1);
  }

  /** 飛んでいた矢が届いたら、損害を与える */
  private landVolleys(): void {
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      const v = this.volleys[i];
      if (v.at > this.time) continue;
      this.volleys.splice(i, 1);
      const t = this.unit(v.targetId);
      if (t && t.state !== "gone" && !t.escaped) {
        this.hurt(t, v.casualties);
        t.morale -= 0.6; // 矢を浴びると、じわじわ士気が削られる
      }
    }
  }

  private updateMorale(u: BattleUnit, dt: number): void {
    if (u.state === "gone") return;
    u.calm += dt;
    // 損害:短い時間に多く失うほど、大きく下がる
    u.morale -= u.recentLoss * 70;
    u.recentLoss = 0;
    // 側面・背後から攻められている
    for (const id of u.engaged) {
      const e = this.unit(id);
      if (!e) continue;
      const flank = this.flankFactor(e, u);
      if (flank > 1) u.morale -= (flank === 2 ? 1.6 : 0.8) * dt;
    }
    if (u.engaged.length > 0) u.morale -= 0.12 * dt; // 戦いが長引くと消耗する
    if (u.fatigue > 70) u.morale -= 0.3 * dt;
    // 落ち着いていれば、指揮官の統率に応じて少しずつ持ち直す
    if (u.calm > 4 && u.engaged.length === 0 && u.morale < u.baseMorale) {
      const c = this.commanders[u.side];
      u.morale += (c.active ? 0.6 + c.leadership / 120 : 0.4) * dt;
    }
    u.morale = Math.max(0, Math.min(100, u.morale));

    if (u.state !== "routing" && (u.morale <= ROUT_MORALE || u.men < u.maxMen * 0.12)) {
      this.rout(u);
    } else if (u.state === "routing" && u.morale > 45 && u.calm > 12) {
      // 追われずに逃げ切れた部隊は、まれに立ち直る
      u.state = "idle";
      u.order = { kind: "hold" };
    }
  }

  /** 部隊が崩れて敗走する。近くの味方も動揺する */
  private rout(u: BattleUnit): void {
    u.state = "routing";
    u.order = { kind: "hold" };
    this.fx.push({ kind: "rout", unitId: u.id });
    for (const f of this.units) {
      if (f === u || f.state === "gone" || f.escaped) continue;
      const d = Math.hypot(f.x - u.x, f.z - u.z);
      if (d > 60) continue;
      if (f.side === u.side) f.morale -= 4;
      else f.morale = Math.min(100, f.morale + 5); // 敵が崩れるのを見ると、勢いづく
    }
  }

  /** 本陣が崩れたら、指揮官が戦えなくなったとして全軍が動揺する */
  private checkCommanders(): void {
    for (const side of ["attacker", "defender"] as SideId[]) {
      const c = this.commanders[side];
      if (!c.active) continue;
      const command = this.units.find((u) => u.side === side && u.isCommand);
      if (command && this.isActive(command)) continue;
      c.active = false;
      this.fx.push({ kind: "commanderDown", side });
      for (const u of this.units) {
        if (u.side === side && this.isActive(u)) u.morale -= 15;
      }
    }
  }

  private checkEnd(): void {
    for (const side of ["attacker", "defender"] as SideId[]) {
      const active = this.menOf(side, true);
      if (active <= 0) {
        // 残った兵がほとんどいなければ全滅、そうでなければ敗走
        const survivors = this.units.filter((u) => u.side === side).reduce((s, u) => s + u.men, 0);
        this.finish(other(side), survivors < this.initialMen[side] * 0.08 ? "annihilated" : "routed");
        return;
      }
      if (active < this.initialMen[side] * BREAK_RATIO) {
        // 主力が崩れた:残った部隊も戦意を失って逃げる
        for (const u of this.units) {
          if (u.side === side && this.isActive(u)) this.rout(u);
        }
        this.finish(other(side), "routed");
        return;
      }
    }
    if (this.time >= TIME_LIMIT) this.finish("draw", "timeout");
  }

  private finish(winner: BattleResult["winner"], reason: BattleResult["reason"]): void {
    this.result = buildResult(this.setup, this.units, this.time, winner, reason);
  }
}
