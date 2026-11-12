// 部品の一覧を、実際に描ける3Dの都市にする。
// 同じ形・同じ質感の部品は1回の命令でまとめて描く(インスタンシング)ので、
// 建物が数百あってもiPhoneで軽く動く。
import * as THREE from "three";
import type { CityBlueprint, DetailTier } from "./CityBuilder";
import { getCityParts } from "./CityParts";

/** カメラがこの距離より近いときだけ表示する(中距離用・近距離用) */
const TIER_MAX_DISTANCE: Record<DetailTier, number> = { 0: Infinity, 1: 70, 2: 32 };

export class CityModel {
  readonly group = new THREE.Group();
  readonly radius: number;
  readonly height: number;
  private readonly tiers: THREE.Group[] = [new THREE.Group(), new THREE.Group(), new THREE.Group()];

  constructor(blueprint: CityBlueprint) {
    this.radius = blueprint.radius;
    this.height = blueprint.height;
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
  }

  /** カメラの距離に応じて、細かい部品を出し入れする */
  setCameraDistance(distance: number): void {
    this.tiers.forEach((t, i) => {
      t.visible = distance < TIER_MAX_DISTANCE[i as DetailTier];
    });
  }
}
