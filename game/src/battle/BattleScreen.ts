// 3D会戦の画面。戦場・部隊の表示・計算・カメラ・画面表示をつなぎ、タッチ操作を部隊への命令に変える。
import * as THREE from "three";
import type { BattleSetup } from "../data/types";
import { BattleHud } from "../ui/BattleHud";
import type { HeightField } from "../world/heightField";
import type { Difficulty } from "./ai";
import { BattleCamera } from "./BattleCamera";
import { Battlefield, type TimeOfDay } from "./Battlefield";
import { BattleSim } from "./BattleSim";
import { BattleView } from "./BattleView";
import { deploy, FIELD, formations } from "./deploy";
import { FieldMap } from "./fieldData";
import type { BattleResult, BattleUnit, FormationId, SideId, UnitOrder } from "./types";

const SPEEDS = [1, 2, 4];
const FORMATION_ORDER: FormationId[] = ["line", "column", "square", "wedge"];

export interface BattleOptions {
  /** プレイヤーが指揮する側 */
  playerSide: SideId;
  /** 敵AIの難易度 */
  difficulty: Difficulty;
  /** 光の雰囲気(朝・昼・夕方) */
  timeOfDay: TimeOfDay;
}

export class BattleScreen {
  readonly sim: BattleSim;
  private readonly scene = new THREE.Scene();
  private readonly field: FieldMap;
  private readonly battlefield: Battlefield;
  private readonly view: BattleView;
  private readonly camera: BattleCamera;
  private readonly hud: BattleHud;
  /** 選択中の部隊。最後の1つが、下のパネルに表示される */
  private selectedIds: string[] = [];
  /** 複数選択の最中か(タップするたびに、選択に足したり外したりする) */
  private multi = false;
  private following = false;
  private paused = false;
  private speedIndex = 0;
  private hudTimer = 0;
  private resultShown = false;
  private width = 1;
  private height = 1;

  /**
   * 会戦地点の実地形を読み込んでから、戦場を作る。
   * coarse は戦略マップの標高データ(遠景と、高解像度データが無い地点で使う)。
   * bearing は、攻撃側から見た防御側の方角。onLeave は、結果画面で「戦略マップへ戻る」が押されたときに呼ばれる。
   */
  static async create(
    renderer: THREE.WebGLRenderer, hudRoot: HTMLElement, setup: BattleSetup, coarse: HeightField, bearing: number,
    options: BattleOptions, onLeave: (result: BattleResult) => void,
  ): Promise<BattleScreen> {
    const field = await FieldMap.load(setup.location.lon, setup.location.lat, bearing, coarse);
    return new BattleScreen(renderer, hudRoot, setup, field, options, onLeave);
  }

  private constructor(
    private readonly renderer: THREE.WebGLRenderer, hudRoot: HTMLElement,
    setup: BattleSetup, field: FieldMap, options: BattleOptions,
    onLeave: (result: BattleResult) => void,
  ) {
    const playerSide = options.playerSide;
    this.field = field;
    this.sim = new BattleSim(setup, deploy(setup), this.field, playerSide, options.difficulty);
    this.battlefield = new Battlefield(this.field, options.timeOfDay);
    this.battlefield.applyTo(this.scene);
    this.view = new BattleView(this.sim);
    this.scene.add(this.view.group);
    this.camera = new BattleCamera(this.field);

    this.hud = new BattleHud(hudRoot, this.sim, {
      onSelect: (id) => this.tapOwnUnit(id, true),
      onHold: () => this.orderSelected(() => ({ kind: "hold" })),
      // 前進・後退:いま向いている方向へ(または逆へ)40進む。後退は敵に向いたまま下がる
      onAdvance: () => this.orderSelected((u) => ({ kind: "move", x: u.x + Math.sin(u.facing) * 40, z: u.z - Math.cos(u.facing) * 40 })),
      onFallBack: () =>
        this.orderSelected((u) => ({ kind: "move", x: u.x - Math.sin(u.facing) * 30, z: u.z + Math.cos(u.facing) * 30, keepFacing: true })),
      onPursue: () => {
        const on = this.selected()?.order.kind === "pursue";
        this.orderSelected(() => (on ? { kind: "hold" } : { kind: "pursue" }));
      },
      onRetreatUnit: () => this.orderSelected(() => ({ kind: "retreat" })),
      onFormation: () => {
        // 押すたびに、横陣 → 縦陣 → 方陣 → 楔形陣 と切り替える
        const first = this.selected();
        if (!first) return;
        const next = FORMATION_ORDER[(FORMATION_ORDER.indexOf(first.formation) + 1) % FORMATION_ORDER.length];
        for (const u of this.selectedUnits()) this.sim.setFormation(u.id, next);
        this.hud.toast(`${formations[next].name}:${formations[next].note}`);
        this.refreshHud();
      },
      onTurn: (dir) => {
        for (const u of this.selectedUnits()) this.sim.turn(u.id, dir * (Math.PI / 4));
        this.refreshHud();
      },
      onMulti: () => {
        this.multi = !this.multi;
        this.hud.setMulti(this.multi);
      },
      onSelectAll: () => {
        this.selectedIds = this.sim.units.filter((u) => u.side === playerSide && this.sim.isActive(u)).map((u) => u.id);
        this.refreshHud();
      },
      onFollow: () => {
        this.following = !this.following;
        this.hud.setFollowing(this.following);
      },
      onOverview: () => {
        this.following = false;
        this.hud.setFollowing(false);
        this.camera.overview();
      },
      onCloseUp: () => {
        // 選択中の部隊(なければ自軍の中央)へ寄る
        const u = this.selected() ?? this.sim.units.find((k) => k.side === playerSide && this.sim.isActive(k));
        if (!u) return;
        this.camera.lookAt(u.x, u.z);
        this.camera.distance = 60;
        this.camera.pitch = 0.42;
        this.camera.update();
      },
      onRotate: (dir) => this.camera.rotate(dir * (Math.PI / 8)),
      onAdvanceAll: () => {
        for (const u of this.sim.units) {
          if (u.side === playerSide && this.sim.isActive(u) && !u.isCommand) this.sim.order(u.id, { kind: "pursue" });
        }
        this.refreshHud();
      },
      onRetreatAll: () => this.hud.confirmRetreat(() => this.sim.retreatAll(playerSide)),
      onPause: () => {
        this.paused = !this.paused;
        this.hud.setPaused(this.paused);
      },
      onSpeed: () => {
        this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
        this.hud.setSpeed(SPEEDS[this.speedIndex]);
      },
      onLeave: () => {
        if (this.sim.result) onLeave(this.sim.result);
      },
    });
    this.hud.setTerrainInfo(
      `${this.field.info.label}・標高 ${this.field.info.minMeters}〜${this.field.info.maxMeters}m・景観設定 ${this.battlefield.landscape.name}・${this.battlefield.time.name}`,
      this.field.info.source === "coarse",
    );
    this.refreshHud();
  }

  /** パネルに表示する部隊(最後に選んだもの) */
  private selected(): BattleUnit | null {
    const id = this.selectedIds[this.selectedIds.length - 1];
    return (id && this.sim.unit(id)) || null;
  }

  private selectedUnits(): BattleUnit[] {
    return this.selectedIds.map((id) => this.sim.unit(id)).filter((u): u is BattleUnit => !!u && this.sim.isActive(u));
  }

  private refreshHud(): void {
    this.hud.update(this.selected(), this.selectedIds);
  }

  /** 自軍の部隊がタップされた。複数選択の最中なら足したり外したりし、そうでなければその部隊だけを選ぶ */
  private tapOwnUnit(id: string, focus = false): void {
    if (this.multi) {
      this.selectedIds = this.selectedIds.includes(id) ? this.selectedIds.filter((k) => k !== id) : [...this.selectedIds, id];
    } else {
      this.selectedIds = [id];
      const u = this.sim.unit(id);
      if (u && focus) this.camera.lookAt(u.x, u.z);
    }
    this.refreshHud();
  }

  /** 選択中のすべての部隊に命令を出す。従わなかった部隊があれば知らせる */
  private orderSelected(make: (u: BattleUnit) => UnitOrder): void {
    let refused = 0;
    for (const u of this.selectedUnits()) {
      if (this.sim.order(u.id, make(u)) === "refused") refused++;
    }
    if (refused > 0) this.hud.toast(refused === 1 ? "部隊が動揺して、命令に従わない" : `${refused}部隊が動揺して、命令に従わない`);
    this.refreshHud();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.setViewport(width, height);
    this.view.setViewportHeight(height);
  }

  private toNdc(x: number, y: number): THREE.Vector2 {
    return new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
  }

  // ===== タッチ操作 =====

  onPan(fx: number, fy: number, tx: number, ty: number): void {
    this.following = false;
    this.hud.setFollowing(false);
    this.camera.pan(this.toNdc(fx, fy), this.toNdc(tx, ty));
  }

  onZoom(factor: number, x: number, y: number): void {
    this.camera.zoom(factor, this.toNdc(x, y));
  }

  onRotate(angle: number): void {
    this.camera.rotate(angle);
  }

  /** タップ:自軍の部隊なら選択、敵なら攻撃、地面なら移動 */
  onTap(x: number, y: number): void {
    if (this.sim.result) return;
    const point = this.pickGround(x, y);
    if (!point) return;
    // タップした地点にいちばん近い部隊(隊列の枠から少しはみ出ても拾う。指で押しやすいよう、遠いほど広く取る)
    let hit: BattleUnit | null = null;
    let best = Math.max(5, this.camera.distance * 0.035);
    for (const u of this.sim.units) {
      if (u.state === "gone" || u.escaped) continue;
      const d = this.sim.gap(u, { ...u, x: point.x, z: point.z, width: 0.1, depth: 0.1 });
      if (d < best) {
        best = d;
        hit = u;
      }
    }
    const mine = this.selectedUnits();
    if (hit && hit.side === this.sim.playerSide) {
      this.tapOwnUnit(hit.id);
      return;
    }
    if (hit && mine.length > 0) {
      const target = hit;
      this.orderSelected(() => ({ kind: "attack", targetId: target.id }));
    } else if (mine.length > 0 && Math.abs(point.x) <= FIELD.width / 2 && Math.abs(point.z) <= FIELD.depth / 2) {
      // 複数の部隊は、いまの並びを保ったまま、まとまって移動する
      const cx = mine.reduce((s, u) => s + u.x, 0) / mine.length;
      const cz = mine.reduce((s, u) => s + u.z, 0) / mine.length;
      this.orderSelected((u) => ({ kind: "move", x: point.x + (u.x - cx), z: point.z + (u.z - cz) }));
    } else if (!hit && !this.multi) {
      this.selectedIds = [];
      this.refreshHud();
    }
  }

  /** タップした画面上の点が、戦場のどこにあたるか */
  private pickGround(x: number, y: number): { x: number; z: number } | null {
    const { origin, direction } = this.camera.ray(this.toNdc(x, y));
    const p = new THREE.Vector3();
    for (let t = 0; t < 1800; t += 1.5) {
      p.copy(origin).addScaledVector(direction, t);
      if (p.y <= this.field.heightAt(p.x, p.z)) return { x: p.x, z: p.z };
    }
    return null;
  }

  // ===== 毎フレーム =====

  /** dt は前回からの現実の秒数 */
  update(dt: number): void {
    // 処理が遅れたコマでも、戦闘の計算は決まった刻みで進める(一度に進める時間に上限を付ける)
    const step = this.paused ? 0 : Math.min(dt, 0.1) * SPEEDS[this.speedIndex];
    if (step > 0) this.sim.update(step);
    // 戦況の知らせ(表示側が出来事を読み取って消す前に、ここで拾う)
    for (const fx of this.sim.fx) {
      if (fx.kind === "commanderDown") {
        this.hud.toast(fx.side === this.sim.playerSide ? "自軍の本陣が崩れた! 全軍が動揺している" : "敵の本陣が崩れた! 敵軍が動揺している");
      }
    }
    // 壊滅・退場した部隊は、選択から外す
    this.selectedIds = this.selectedIds.filter((id) => {
      const u = this.sim.unit(id);
      return !!u && !u.escaped && u.state !== "gone";
    });
    const u = this.selected();
    if (this.following && u) this.camera.lookAt(u.x, u.z, Math.min(1, dt * 4));
    this.view.setSelection(this.selectedUnits().length > 0 || u ? this.selectedIds.map((id) => this.sim.unit(id)!).filter(Boolean) : []);
    this.view.update(step, this.camera.distance);
    this.battlefield.update(step, this.camera.distance);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.refreshHud();
    }
    if (this.sim.result && !this.resultShown) {
      this.resultShown = true;
      this.hud.showResult(this.sim.result);
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera.camera);
  }

  /** 戦闘を終えて、使っていたメモリを返す */
  dispose(): void {
    this.hud.hide();
    this.view.dispose();
    this.battlefield.dispose();
  }
}
