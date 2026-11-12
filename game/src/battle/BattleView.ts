// 部隊を「整列した兵士の集まり」として描く。兵士は部隊の動きに合わせて歩き、戦い、逃げる。
// 兵力が減ると、後ろの列から兵士が減り、その場に倒れた兵が残る。
// 兵科ごとに同じ形をまとめて描く(インスタンシング)ので、千体を超えてもiPhoneで動く。
import * as THREE from "three";
import { factionById } from "../data";
import type { BattleSim } from "./BattleSim";
import { unitClasses } from "./deploy";
import { getSoldiers, type SoldierShape } from "./soldiers";
import type { BattleUnit, UnitClassId } from "./types";

/** カメラがこれより遠いときは、兵士を1体おきに描いて軽くする */
const THIN_DISTANCE = 240;
const MAX_FALLEN = 320;
const MAX_ARROWS = 220;

/** 兵士1体の、いまの位置(隊列の中の持ち場へ向かって動く) */
interface Figure {
  x: number;
  z: number;
  /** 動きのずれ(全員が同じ動きにならないように) */
  phase: number;
  jx: number;
  jz: number;
}

interface Arrow {
  fromX: number; fromY: number; fromZ: number;
  toX: number; toY: number; toZ: number;
  start: number;
  flight: number;
}

export class BattleView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<SoldierShape, THREE.InstancedMesh>();
  private readonly figures = new Map<string, Figure[]>();
  private readonly colors = new Map<string, THREE.Color>();
  private readonly poles: THREE.InstancedMesh;
  private readonly cloths: THREE.InstancedMesh;
  private readonly fallen: THREE.InstancedMesh;
  private fallenCount = 0;
  private readonly arrows: THREE.InstancedMesh;
  private readonly flying: Arrow[] = [];
  private readonly selection: THREE.Mesh;
  private readonly targetMark: THREE.Mesh;
  private readonly dummy = new THREE.Object3D();

  constructor(private readonly sim: BattleSim) {
    const soldiers = getSoldiers();
    // 兵科ごとに、両軍あわせた最大の体数ぶんの枠を用意する
    const capacity = new Map<SoldierShape, number>();
    for (const u of sim.units) {
      const n = Math.ceil(u.maxMen / sim.menPerFigure) + 1;
      capacity.set(u.classId, (capacity.get(u.classId) ?? 0) + n);
      this.colors.set(u.id, new THREE.Color(this.factionColor(u)));
    }
    capacity.set("general", 2);
    for (const [shape, count] of capacity) {
      const mesh = new THREE.InstancedMesh(soldiers.geometry(shape), soldiers.material, count);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.meshes.set(shape, mesh);
      this.group.add(mesh);
    }

    // 部隊旗:竿と、勢力の色の布
    const n = sim.units.length;
    this.poles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1, 0.12).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: "#2f261e" }), n);
    this.cloths = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.06).translate(0.5, 0, 0), new THREE.MeshLambertMaterial({ color: "#ffffff" }), n);
    this.poles.frustumCulled = this.cloths.frustumCulled = false;
    this.group.add(this.poles, this.cloths);

    // 倒れた兵
    this.fallen = new THREE.InstancedMesh(soldiers.geometry("fallen"), soldiers.material, MAX_FALLEN);
    this.fallen.count = 0;
    this.fallen.frustumCulled = false;
    this.fallen.receiveShadow = true;
    this.group.add(this.fallen);

    // 矢
    this.arrows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.5), new THREE.MeshBasicMaterial({ color: "#f3ecd8" }), MAX_ARROWS);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.group.add(this.arrows);

    // 選択中の部隊の足もとに出す枠と、命令の目標の印
    const mark = (color: number): THREE.Mesh => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthTest: false }),
      );
      m.renderOrder = 2;
      m.visible = false;
      this.group.add(m);
      return m;
    };
    this.selection = mark(0xf2d489);
    this.targetMark = mark(0xe05a48);
  }

  private factionColor(u: BattleUnit): string {
    const side = u.side === "attacker" ? this.sim.setup.attacker : this.sim.setup.defender;
    return factionById(side.factionId)?.color ?? "#9a9a9a";
  }

  /** 選択中の部隊と、その命令の目標(移動先や攻撃相手)を表示する */
  setSelection(unit: BattleUnit | null): void {
    this.selection.visible = unit !== null;
    this.targetMark.visible = false;
    if (!unit) return;
    const h = this.sim.field.heightAt(unit.x, unit.z);
    this.selection.position.set(unit.x, h + 0.25, unit.z);
    this.selection.rotation.y = -unit.facing;
    this.selection.scale.set(unit.width + 2.5, 1, unit.depth + 2.5);
    const o = unit.order;
    const target = o.kind === "attack" || o.kind === "pursue" ? (o.targetId ? this.sim.unit(o.targetId) : undefined) : undefined;
    if (target && target.men > 0 && !target.escaped) {
      this.targetMark.visible = true;
      this.targetMark.position.set(target.x, this.sim.field.heightAt(target.x, target.z) + 0.25, target.z);
      this.targetMark.rotation.y = -target.facing;
      this.targetMark.scale.set(target.width + 2.5, 1, target.depth + 2.5);
    } else if (o.kind === "move") {
      this.targetMark.visible = true;
      this.targetMark.position.set(o.x, this.sim.field.heightAt(o.x, o.z) + 0.25, o.z);
      this.targetMark.rotation.y = 0;
      this.targetMark.scale.set(5, 1, 5);
    }
  }

  /** 計算の結果に合わせて、兵士・旗・矢を描き直す。dt は前回からの秒数(見た目の動き用) */
  update(dt: number, cameraDistance: number): void {
    const { sim, dummy } = this;
    const field = sim.field;
    const thin = cameraDistance > THIN_DISTANCE;
    const counts = new Map<SoldierShape, number>();
    const put = (shape: SoldierShape, color: THREE.Color): void => {
      const mesh = this.meshes.get(shape)!;
      const i = counts.get(shape) ?? 0;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color);
      counts.set(shape, i + 1);
    };
    const t = sim.time;
    let flag = 0;

    for (const u of sim.units) {
      const cls = unitClasses[u.classId];
      const color = this.colors.get(u.id)!;
      const want = u.state === "gone" || u.escaped ? 0 : Math.max(1, Math.ceil(u.men / sim.menPerFigure));
      let list = this.figures.get(u.id);
      if (!list) {
        list = [];
        this.figures.set(u.id, list);
      }
      // 兵士が減ったら、後ろの列から消して、その場に倒れた兵を残す
      while (list.length > want) {
        const f = list.pop()!;
        if (!u.escaped) this.addFallen(f.x, f.z, u.facing + f.phase);
      }
      const cos = Math.cos(u.facing);
      const sin = Math.sin(u.facing);
      const cavalry = cls.category === "cavalry";
      const rowGap = cls.spacing * (cavalry ? 1.5 : 1);
      const rows = Math.ceil(want / u.columns);
      const loose = u.state === "routing" ? 2.6 : u.state === "melee" ? 1.25 : 1;
      const moving = u.state === "moving" || u.state === "routing" || u.state === "retreating";
      const stride = cavalry ? 0.22 : 0.12;

      for (let k = 0; k < want; k++) {
        const row = Math.floor(k / u.columns);
        const inRow = Math.min(u.columns, want - row * u.columns);
        const col = k % u.columns;
        let f = list[k];
        // 隊列の中の持ち場(部隊から見て、右へ・後ろへ)
        const right = (col - (inRow - 1) / 2) * cls.spacing;
        const back = (row - (rows - 1) / 2) * rowGap;
        if (!f) {
          f = { x: 0, z: 0, phase: Math.random() * 6.28, jx: (Math.random() - 0.5) * 0.5, jz: (Math.random() - 0.5) * 0.5 };
          f.x = u.x + right * cos - back * sin;
          f.z = u.z + right * sin + back * cos;
          list[k] = f;
        }
        // 接近戦では、前の列が敵へ踏み込んでは下がる
        const lunge = u.state === "melee" && row < 2 ? Math.max(0, Math.sin(t * 5 + f.phase)) * 0.7 : 0;
        const r = right + f.jx * loose;
        const b = back + f.jz * loose - lunge;
        const tx = u.x + r * cos - b * sin;
        const tz = u.z + r * sin + b * cos;
        // 持ち場へ向かって、少し遅れて付いていく(全員がぴったり同じには動かない)
        const follow = Math.min(1, dt * (u.state === "routing" ? 3 : 6));
        f.x += (tx - f.x) * follow;
        f.z += (tz - f.z) * follow;
        if (thin && want > 12 && k % 2 === 1) continue;

        const bob = moving ? Math.abs(Math.sin(t * (u.running ? 11 : 7) + f.phase)) * stride : 0;
        dummy.position.set(f.x, field.heightAt(f.x, f.z) + bob, f.z);
        // 走るときは前のめりに、戦うときは小刻みに体を振る
        dummy.rotation.set(
          moving ? (u.running ? -0.16 : -0.05) : lunge > 0.3 ? -0.2 : 0,
          -u.facing + (u.state === "routing" ? Math.sin(f.phase) * 0.5 : 0),
          u.state === "melee" ? Math.sin(t * 9 + f.phase) * 0.06 : 0,
        );
        dummy.scale.setScalar(1);
        // 本陣の先頭の1体は、指揮官として描く
        if (u.isCommand && k === 0) {
          dummy.scale.setScalar(1.3);
          put("general", color);
        } else {
          put(u.classId, color);
        }
      }

      // 部隊旗:部隊の前列の中央に立てる。本陣の旗は大きい
      if (want > 0) {
        const size = u.isCommand ? 1.9 : 1;
        const fx = u.x + (u.depth / 2) * sin * 0.4;
        const fz = u.z - (u.depth / 2) * cos * 0.4;
        const y = field.heightAt(fx, fz);
        dummy.position.set(fx, y, fz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(size, 5.2 * size, size);
        dummy.updateMatrix();
        this.poles.setMatrixAt(flag, dummy.matrix);
        // 布は、風にあおられて少し揺れる
        dummy.position.set(fx, y + 4.2 * size, fz);
        dummy.rotation.set(0, Math.sin(t * 2 + flag) * 0.25, 0);
        dummy.scale.set(2.4 * size, 1.5 * size, 1);
        dummy.updateMatrix();
        this.cloths.setMatrixAt(flag, dummy.matrix);
        this.cloths.setColorAt(flag, color);
        flag++;
      }
    }

    for (const [shape, mesh] of this.meshes) {
      mesh.count = counts.get(shape) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.poles.count = this.cloths.count = flag;
    this.poles.instanceMatrix.needsUpdate = true;
    this.cloths.instanceMatrix.needsUpdate = true;
    if (this.cloths.instanceColor) this.cloths.instanceColor.needsUpdate = true;

    this.readFx();
    this.updateArrows();
  }

  private addFallen(x: number, z: number, angle: number): void {
    const i = this.fallenCount % MAX_FALLEN;
    this.fallenCount++;
    this.dummy.position.set(x, this.sim.field.heightAt(x, z), z);
    this.dummy.rotation.set(0, angle, 0);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.fallen.setMatrixAt(i, this.dummy.matrix);
    this.fallen.setColorAt(i, new THREE.Color("#ffffff"));
    this.fallen.count = Math.min(this.fallenCount, MAX_FALLEN);
    this.fallen.instanceMatrix.needsUpdate = true;
    if (this.fallen.instanceColor) this.fallen.instanceColor.needsUpdate = true;
  }

  /** 計算側から届いた出来事を、見た目に反映する(矢の斉射) */
  private readFx(): void {
    const field = this.sim.field;
    for (const fx of this.sim.fx) {
      if (fx.kind !== "volley") continue;
      for (let i = 0; i < fx.count && this.flying.length < MAX_ARROWS; i++) {
        const sx = fx.fromX + (Math.random() - 0.5) * 12;
        const sz = fx.fromZ + (Math.random() - 0.5) * 5;
        const ex = fx.toX + (Math.random() - 0.5) * 14;
        const ez = fx.toZ + (Math.random() - 0.5) * 8;
        this.flying.push({
          fromX: sx, fromY: field.heightAt(sx, sz) + 1.6, fromZ: sz,
          toX: ex, toY: field.heightAt(ex, ez) + 0.4, toZ: ez,
          start: this.sim.time + Math.random() * 0.35, flight: fx.flight,
        });
      }
    }
    this.sim.fx = [];
  }

  /** 矢を、山なりの軌道で飛ばす */
  private updateArrows(): void {
    const t = this.sim.time;
    const d = this.dummy;
    let n = 0;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const a = this.flying[i];
      const k = (t - a.start) / a.flight;
      if (k >= 1) {
        this.flying.splice(i, 1);
        continue;
      }
      if (k < 0) continue;
      const arc = 5 + Math.hypot(a.toX - a.fromX, a.toZ - a.fromZ) * 0.14;
      const at = (q: number): [number, number, number] => [
        a.fromX + (a.toX - a.fromX) * q,
        a.fromY + (a.toY - a.fromY) * q + arc * 4 * q * (1 - q),
        a.fromZ + (a.toZ - a.fromZ) * q,
      ];
      d.position.set(...at(k));
      d.scale.setScalar(1);
      d.lookAt(...at(Math.min(1, k + 0.03)));
      d.updateMatrix();
      this.arrows.setMatrixAt(n++, d.matrix);
    }
    this.arrows.count = n;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [...this.meshes.values(), this.poles, this.cloths, this.fallen, this.arrows]) mesh.dispose();
  }
}

export type { UnitClassId };
