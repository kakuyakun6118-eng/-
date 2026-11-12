// 「部品の一覧」を、まとめて描ける形にする共通の仕組み。都市と軍団の両方で使う。
// 同じ形・同じ質感の部品は1回の命令でまとめて描く(インスタンシング)ので、
// 建物や兵士が数百あってもiPhoneで軽く動く。
import * as THREE from "three";
import { getCityParts, type PartShape, type PartSurface } from "../city/CityParts";

/**
 * 部品をいつ表示するか。
 * 0 = いつも / 1 = 中距離から / 2 = 近距離だけ / 3 = 遠いときだけ(近づくと細かい部品に置き換わる)
 * 4 = 選択しているときだけ
 */
export type DetailTier = 0 | 1 | 2 | 3 | 4;

/** 部品1つ:どの形を、どこに、どの大きさ・色で置くか */
export interface Part {
  shape: PartShape;
  surface: PartSurface;
  tier: DetailTier;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** 上から見た回転(ラジアン) */
  rot: number;
  color: string;
}

/** 部品の一覧から、表示の切り替え単位(tier)ごとのまとまりを作る */
export function createPartGroups(parts: Part[]): THREE.Group[] {
  const groups = Array.from({ length: 5 }, () => new THREE.Group());
  const lib = getCityParts();

  // 「形 + 質感 + 表示距離」が同じ部品をひとまとめにする
  const batches = new Map<string, Part[]>();
  for (const part of parts) {
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
    groups[tier].add(mesh);
  }
  return groups;
}
