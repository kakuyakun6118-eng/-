// 3D会戦の画面。戦場・部隊の表示・計算・カメラ・画面表示をつなぎ、タッチ操作を部隊への命令に変える。
import * as THREE from "three";
import type { BattleSetup } from "../data/types";
import type { HeightField } from "../world/heightField";
import { BattleHud } from "../ui/BattleHud";
import { BattleCamera } from "./BattleCamera";
import { Battlefield } from "./Battlefield";
import { BattleSim } from "./BattleSim";
import { BattleView } from "./BattleView";
import { deploy, FIELD } from "./deploy";
import { FieldMap } from "./fieldData";
import type { BattleResult, BattleUnit, SideId } from "./types";

const SPEEDS = [1, 2, 4];

export class BattleScreen {
  readonly sim: BattleSim;
  private readonly scene = new THREE.Scene();
  private readonly field: FieldMap;
  private readonly battlefield: Battlefield;
  private readonly view: BattleView;
  private readonly camera: BattleCamera;
  private readonly hud: BattleHud;
  private selectedId: string | null = null;
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
    playerSide: SideId, onLeave: (result: BattleResult) => void,
  ): Promise<BattleScreen> {
    const field = await FieldMap.load(setup.location.lon, setup.location.lat, bearing, coarse);
    return new BattleScreen(renderer, hudRoot, setup, field, playerSide, onLeave);
  }

  private constructor(
    private readonly renderer: THREE.WebGLRenderer, hudRoot: HTMLElement,
    setup: BattleSetup, field: FieldMap, playerSide: SideId,
    onLeave: (result: BattleResult) => void,
  ) {
    this.field = field;
    this.sim = new BattleSim(setup, deploy(setup), this.field, playerSide);
    this.battlefield = new Battlefield(this.field);
    this.battlefield.applyTo(this.scene);
    this.view = new BattleView(this.sim);
    this.scene.add(this.view.group);
    this.camera = new BattleCamera(this.field);

    this.hud = new BattleHud(hudRoot, this.sim, {
      onSelect: (id) => this.select(id, true),
      onHold: () => this.orderSelected({ kind: "hold" }),
      onPursue: () => {
        const u = this.selected();
        if (u) this.sim.order(u.id, u.order.kind === "pursue" ? { kind: "hold" } : { kind: "pursue" });
      },
      onRetreatUnit: () => this.orderSelected({ kind: "retreat" }),
      onFollow: () => {
        this.following = !this.following;
        this.hud.setFollowing(this.following);
      },
      onOverview: () => {
        this.following = false;
        this.hud.setFollowing(false);
        this.camera.overview();
      },
      onRotate: (dir) => this.camera.rotate(dir * (Math.PI / 8)),
      onAdvanceAll: () => {
        for (const u of this.sim.units) {
          if (u.side === playerSide && this.sim.isActive(u) && !u.isCommand) this.sim.order(u.id, { kind: "pursue" });
        }
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
      `${this.field.info.label}・標高 ${this.field.info.minMeters}〜${this.field.info.maxMeters}m`,
      this.field.info.source === "coarse",
    );
    this.hud.update(null);
  }

  private selected(): BattleUnit | null {
    return (this.selectedId && this.sim.unit(this.selectedId)) || null;
  }

  private select(id: string | null, focus = false): void {
    this.selectedId = id;
    const u = this.selected();
    if (u && focus) this.camera.lookAt(u.x, u.z);
    this.hud.update(u);
  }

  private orderSelected(order: Parameters<BattleSim["order"]>[1]): void {
    const u = this.selected();
    if (u) this.sim.order(u.id, order);
    this.hud.update(this.selected());
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.camera.setViewport(width, height);
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
    // タップした地点にいちばん近い部隊(隊列の枠から少しはみ出ても拾う)
    let hit: BattleUnit | null = null;
    let best = 5;
    for (const u of this.sim.units) {
      if (u.state === "gone" || u.escaped) continue;
      const d = this.sim.gap(u, { ...u, x: point.x, z: point.z, width: 0.1, depth: 0.1 });
      if (d < best) {
        best = d;
        hit = u;
      }
    }
    const mine = this.selected();
    if (hit && hit.side === this.sim.playerSide) {
      this.select(hit.id);
    } else if (hit && mine) {
      this.sim.order(mine.id, { kind: "attack", targetId: hit.id });
    } else if (mine && Math.abs(point.x) <= FIELD.width / 2 && Math.abs(point.z) <= FIELD.depth / 2) {
      this.sim.order(mine.id, { kind: "move", x: point.x, z: point.z });
    } else if (!hit) {
      this.select(null);
    }
    this.hud.update(this.selected());
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
    const step = this.paused ? 0 : Math.min(dt, 0.1) * SPEEDS[this.speedIndex];
    if (step > 0) this.sim.update(step);
    const u = this.selected();
    if (this.following && u && !u.escaped && u.state !== "gone") this.camera.lookAt(u.x, u.z, Math.min(1, dt * 4));
    this.view.setSelection(u && !u.escaped && u.state !== "gone" ? u : null);
    this.view.update(step, this.camera.distance);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.25;
      this.hud.update(u);
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
