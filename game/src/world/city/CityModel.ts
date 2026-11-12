// 部品の一覧を、実際に描ける3Dの都市にする。
// 同じ形・同じ質感の部品は1回の命令でまとめて描く(インスタンシング)ので、
// 建物が数百あってもiPhoneで軽く動く。
import * as THREE from "three";
import type { CityBlueprint } from "./CityBuilder";
import { getCityParts } from "./CityParts";

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
  private readonly tiers: THREE.Group[] = Array.from({ length: 5 }, () => new THREE.Group());
  /** 選択したときに、城壁に沿って淡く光る枠 */
  private readonly glow: THREE.Mesh;

  constructor(blueprint: CityBlueprint) {
    this.radius = blueprint.radius;
    this.height = blueprint.height;
    this.footprint = blueprint.footprint;
    const lib = getCityParts();

    // 「形 + 質感 + 表示距離」が同じ部品をひとまとめにする
    const batches = new Map<string, typeof blueprint.parts>();
    for (const part of blueprint.parts) {
      const key = `${part.shape}|${part.surface}|${part.tier}`;
      const list = batches.get(key);
      if (list) list.push(part);
      else batches.set(key, [part]);
    }

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();

    for (const list of batches.values()) {
      const { shape, surface, tier } = list[0];
      const mesh = new THREE.InstancedMesh(lib.shapes[shape], lib.surfaces[surface], list.length);
      list.forEach((p, i) => {
        position.set(p.x, p.y, p.z);
        rotation.setFromAxisAngle(up, p.rot);
        scale.set(p.sx, p.sy, p.sz);
        mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
        mesh.setColorAt(i, color.set(p.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.tiers[tier].add(mesh);
    }
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
