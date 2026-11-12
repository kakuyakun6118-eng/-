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

  constructor(blueprint: CityBlueprint) {
    this.radius = blueprint.radius;
    this.height = blueprint.height;
    this.footprint = blueprint.footprint;
    this.tiers = createPartGroups(blueprint.parts);
    this.tiers.forEach((t) => this.group.add(t));

    // 城壁のすぐ外側をなぞる、四角い光の枠
    const [fw, fd] = blueprint.footprint;
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
  }
}
