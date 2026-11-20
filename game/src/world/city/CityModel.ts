// 部品の一覧を、実際に描ける3Dの都市にする。
// まとめて描く仕組みは world/parts/instancing.ts にある(軍団と共通)。
import * as THREE from "three";
import type { CityBlueprint } from "./CityBuilder";
import { createPartGroups } from "../parts/instancing";

/** 近距離・中距離とみなすカメラの距離 */
const NEAR_DISTANCE = 36;
const MID_DISTANCE = 75;

export class CityModel {
  readonly group = new THREE.Group();
  readonly radius: number;
  readonly height: number;
  /** 城壁の外側までの、東西・南北の大きさ */
  readonly footprint: [number, number];
  /** 表示の切り替え単位ごとのまとまり(番号の意味は CityBuilder の DetailTier を参照) */
  private readonly tiers: THREE.Group[];
  /** 選択したときに、城壁に沿って淡く光る枠 */
  private readonly glow: THREE.Mesh;
  /** 首都の淡い金の光(地面の輪と、遠くからも見える金の印) */
  private capitalHalo: THREE.Group | null = null;
  private readonly fw: number;
  private readonly fd: number;

  constructor(blueprint: CityBlueprint) {
    this.radius = blueprint.radius;
    this.height = blueprint.height;
    this.footprint = blueprint.footprint;
    this.tiers = createPartGroups(blueprint.parts);
    this.tiers.forEach((t) => this.group.add(t));

    // 城壁のすぐ外側をなぞる、四角い光の枠
    const [fw, fd] = blueprint.footprint;
    this.fw = fw;
    this.fd = fd;
    const band = 0.14;
    const shape = new THREE.Shape()
      .moveTo(-fw / 2 - band, -fd / 2 - band)
      .lineTo(fw / 2 + band, -fd / 2 - band)
      .lineTo(fw / 2 + band, fd / 2 + band)
      .lineTo(-fw / 2 - band, fd / 2 + band)
      .closePath();
    shape.holes.push(
      new THREE.Path()
        .moveTo(-fw / 2, -fd / 2)
        .lineTo(-fw / 2, fd / 2)
        .lineTo(fw / 2, fd / 2)
        .lineTo(fw / 2, -fd / 2)
        .closePath(),
    );
    this.glow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xf0cf7a, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.glow.position.y = 0.006;
    this.group.add(this.glow);
    this.setSelected(false);
  }

  /** 首都の印(Version 41):足もとの淡い金の輪と、都市の上の金の菱形(遠くでだけ見せる) */
  setCapital(on: boolean): void {
    if (!on) {
      if (this.capitalHalo) this.group.remove(this.capitalHalo);
      this.capitalHalo = null;
      return;
    }
    if (this.capitalHalo) return;
    const g = new THREE.Group();
    const r = Math.max(this.fw, this.fd) * 0.72;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r, r * 1.12, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe8c25a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.position.y = 0.01;
    g.add(ring);
    // 遠くからも首都と分かる金の印(縮小した広域表示でだけ出す)
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(Math.max(this.fw, this.fd) * 0.16),
      new THREE.MeshBasicMaterial({ color: 0xe8c25a, transparent: true, opacity: 0.9 }),
    );
    gem.position.y = this.height + Math.max(this.fw, this.fd) * 0.32;
    gem.scale.y = 1.5;
    gem.name = "capital-gem";
    g.add(gem);
    this.capitalHalo = g;
    this.group.add(g);
  }

  get isCapital(): boolean {
    return !!this.capitalHalo;
  }

  /** 選択中かどうかで、光の枠と城門の幟を出し入れする */
  setSelected(selected: boolean): void {
    this.glow.visible = selected;
    this.tiers[4].visible = selected;
  }

  /** カメラの距離に応じて、細かい部品を出し入れする */
  setCameraDistance(distance: number): void {
    const near = distance < NEAR_DISTANCE;
    this.tiers[1].visible = distance < MID_DISTANCE;
    this.tiers[2].visible = near;
    this.tiers[3].visible = !near; // 遠いときは、民家の代わりに屋根色の面を出す
    const gem = this.capitalHalo?.getObjectByName("capital-gem");
    if (gem) gem.visible = distance > MID_DISTANCE * 0.8;
  }
}
