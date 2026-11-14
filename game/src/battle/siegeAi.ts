// 攻城戦での自動の判断。攻める側と守る側の両方を扱う(プレイヤーが選ばなかった側を動かす)。
import type { BattleSim } from "./BattleSim";
import { unitClasses } from "./deploy";
import type { Siege, SiegeSegment } from "./siege";
import type { SideId } from "./types";

export class SiegeAi {
  posture = "hold";
  private timer = 0;

  constructor(readonly side: SideId, private readonly siege: Siege) {}

  update(sim: BattleSim, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    if (this.side === "attacker") this.attack(sim);
    else this.defend(sim);
  }

  /** 攻める側:兵器を城門と城壁へ送り、道が開くまで歩兵と騎兵は矢の届かない所で待つ */
  private attack(sim: BattleSim): void {
    const siege = this.siege;
    const mine = sim.units.filter((u) => u.side === "attacker" && sim.isActive(u) && u.state !== "retreating");
    const south = siege.layout.segments.filter((s) => s.south && s.hp > 0);
    const gates = south.filter((s) => s.kind === "gate");
    const walls = south.filter((s) => s.kind === "wall");
    const open = siege.passages().length > 0;
    // 残った兵の割合(いったん崩れて下がっている部隊も、まだ軍のうちとして数える)
    const left = sim.menOf("attacker", false) / Math.max(1, sim.initialMenOf("attacker"));
    const morale = mine.reduce((s, u) => s + u.morale, 0) / Math.max(1, mine.length);
    // 兵を失いすぎた、または食糧が尽きて士気が落ちたら、囲みを解いて退く
    if (left < 0.55 || (siege.attackerFood <= 0 && morale < 40)) {
      this.posture = "retreat";
      sim.retreatAll("attacker");
      return;
    }
    this.posture = open ? "storm" : "assault";
    const nearest = (list: SiegeSegment[], x: number): SiegeSegment | undefined =>
      [...list].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const ramAlive = mine.some((u) => u.classId === "ram");
    const scalable = south.filter((s) => s.scalable > 0);
    let ladderIndex = 0;
    let catapults = 0;

    for (const u of mine) {
      const cls = unitClasses[u.classId];
      if (cls.engine) {
        if (u.classId === "ram" || u.classId === "catapult") {
          // 衝車は城門へ。投石機は、半分を城門に、半分を城壁に向ける(城壁を崩して、別の入口を作る)
          const toWall = u.classId === "catapult" && catapults++ % 2 === 1 && walls.length > 0;
          const t = nearest(toWall ? walls : gates.length > 0 ? gates : walls, u.x);
          if (t) sim.command(u.id, { kind: "assault", segmentId: t.id });
        } else if (!open) {
          // 雲梯と櫓は、城門の隣の城壁に、互いに離して取り付ける
          const order = [...walls].sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x));
          const t = order[Math.min(order.length - 1, ladderIndex++ % Math.max(1, order.length))];
          if (t && (u.order.kind !== "assault" || !siege.segment(u.order.segmentId)?.hp)) sim.command(u.id, { kind: "assault", segmentId: t.id });
        }
        continue;
      }
      if (u.isCommand) continue;
      const inside = sim.units.filter((e) => e.side === "defender" && sim.isActive(e) && e.elevation === 0);
      if (open) {
        // 突破口から攻め込み、城内の敵を討つ。敵が見当たらなければ中心部へ向かう
        const e = inside.sort((a, b) => Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z))[0];
        if (cls.range) {
          const t = sim.nearestEnemy(u, (k) => k.state !== "routing");
          if (t) sim.command(u.id, { kind: "attack", targetId: t.id });
        } else if (e) sim.command(u.id, { kind: "attack", targetId: e.id });
        else sim.command(u.id, { kind: "move", x: siege.layout.keep.x, z: siege.layout.keep.z });
        continue;
      }
      if (cls.range) {
        // 弓兵・弩兵は、城壁の上の敵を射る
        const t = sim.nearestEnemy(u, (e) => e.elevation > 0) ?? sim.nearestEnemy(u);
        if (t) sim.command(u.id, { kind: "attack", targetId: t.id });
      } else if (cls.category === "infantry") {
        const climb = nearest(scalable, u.x);
        if (climb) {
          // 雲梯や櫓の掛かった城壁へ取り付き、城壁の上の敵と戦う
          const t = sim.nearestEnemy(u, (e) => e.elevation > 0 && Math.abs(e.x - climb.x) < climb.w / 2 + 14);
          if (t && Math.hypot(u.x - climb.x, u.z - climb.z) < 22) sim.command(u.id, { kind: "attack", targetId: t.id });
          else sim.command(u.id, { kind: "assault", segmentId: climb.id });
        } else if (!ramAlive && gates.length > 0) {
          // 衝車を失ったら、歩兵が城門を打ち破りに行く
          const g = nearest(gates, u.x);
          if (g) sim.command(u.id, { kind: "assault", segmentId: g.id });
        }
      }
      // 騎兵は、道が開くまで後ろで待つ
    }
  }

  /** 守る側:城壁と城門を守り、破られたら突破口へ予備を送る。兵が減ったら中心部へ下がる */
  private defend(sim: BattleSim): void {
    const siege = this.siege;
    const l = siege.layout;
    const mine = sim.units.filter((u) => u.side === "defender" && sim.isActive(u) && u.elevation === 0);
    const left = sim.menOf("defender", true) / Math.max(1, sim.initialMenOf("defender"));
    const passages = siege.passages();
    const fallBack = passages.length > 0 && left < 0.45;
    this.posture = fallBack ? "keep" : passages.length > 0 ? "plug" : "hold";
    for (const u of mine) {
      if (u.isCommand) continue;
      const cls = unitClasses[u.classId];
      const intruder = sim.nearestEnemy(u, (e) => !unitClasses[e.classId].engine && (siege.inside(e.x, e.z) || Math.abs(e.z - l.southZ) < 10));
      const dist = intruder ? Math.hypot(intruder.x - u.x, intruder.z - u.z) : Infinity;
      if (fallBack) {
        // 中心部へ下がって、最後の守りを固める。近くまで来た敵とは戦う
        if (intruder && dist < 26) sim.command(u.id, { kind: "attack", targetId: intruder.id });
        else if (Math.hypot(u.x - l.keep.x, u.z - l.keep.z) > l.keep.r) sim.command(u.id, { kind: "move", x: l.keep.x + (u.x > 0 ? 8 : -8), z: l.keep.z + 6 });
        continue;
      }
      if (passages.length === 0) continue; // 城が破られるまでは、持ち場を守る
      if (cls.range) {
        // 城内の弓兵は、突破口へ入ってくる敵を射る
        if (intruder) sim.command(u.id, { kind: "attack", targetId: intruder.id });
        continue;
      }
      if (intruder && dist < 70) {
        sim.command(u.id, { kind: "attack", targetId: intruder.id });
      } else {
        // 突破口の内側をふさぐ
        const p = [...passages].sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x))[0];
        if (Math.hypot(u.x - p.x, u.z - (p.z - 12)) > 6) sim.command(u.id, { kind: "move", x: p.x, z: p.z - 12 });
      }
    }
  }
}
