// 戦場の地形のデータ(起伏・森・川)。地形の種類から自動で作る。
// ここは計算用で、3Dの見た目は Battlefield.ts が同じデータから作る。
import type { TerrainKind } from "../data/types";
import { FIELD } from "./deploy";

const CELL = 4;

function hash(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** なめらかなノイズを重ねたもの(0〜1) */
export function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;
}

/** 地形の種類ごとの、起伏の大きさ・森の割合・川の有無 */
const PROFILES: Record<string, { relief: number; ridge: number; forest: number; river: number }> = {
  plain: { relief: 1.6, ridge: 0, forest: 0.08, river: 0 },
  grassland: { relief: 2.2, ridge: 0, forest: 0.02, river: 0 },
  desert: { relief: 3.0, ridge: 0, forest: 0, river: 0 },
  forest: { relief: 3.0, ridge: 2, forest: 0.5, river: 0 },
  hill: { relief: 5.0, ridge: 9, forest: 0.18, river: 0 },
  mountain: { relief: 8.0, ridge: 16, forest: 0.25, river: 0 },
  highMountain: { relief: 10.0, ridge: 20, forest: 0.12, river: 0 },
  river: { relief: 1.6, ridge: 0, forest: 0.1, river: 13 },
  crossing: { relief: 1.4, ridge: 0, forest: 0.06, river: 22 },
};

export class FieldMap {
  readonly cols = Math.round(FIELD.width / CELL) + 1;
  readonly rows = Math.round(FIELD.depth / CELL) + 1;
  private readonly heights: Float32Array;
  private readonly forest: Uint8Array;
  /** 川の幅(0 なら川はない) */
  readonly riverWidth: number;
  readonly dry: boolean;

  constructor(readonly terrain: TerrainKind, readonly seed: number) {
    const p = PROFILES[terrain] ?? PROFILES.plain;
    this.riverWidth = p.river;
    this.dry = terrain === "desert" || terrain === "grassland";
    this.heights = new Float32Array(this.cols * this.rows);
    this.forest = new Uint8Array(this.cols * this.rows);
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const x = i * CELL - FIELD.width / 2;
        const z = j * CELL - FIELD.depth / 2;
        let h = (fbm(x / 60, z / 60, seed) - 0.5) * 2 * p.relief;
        // 丘陵や山地では、防御側(奥)に尾根を置く。守る側が高所を取れる
        if (p.ridge > 0) {
          h += p.ridge * Math.exp(-(((z + 78) / 46) ** 2)) * (0.55 + 0.45 * fbm(x / 80 + 9, z / 80, seed + 3));
        }
        // 川:戦場の中央を東西に流れる。川底は低い
        if (p.river > 0) {
          const d = Math.abs(z - this.riverCenter(x));
          if (d < p.river) h -= 1.6 * (1 - (d / p.river) ** 2);
        }
        this.heights[j * this.cols + i] = h;
        // 森:まだらに生える。両軍が並ぶ場所の真ん中は空けておく
        const open = Math.abs(x) < 70 && Math.abs(Math.abs(z) - 62) < 22;
        const f = fbm(x / 45 + 30, z / 45 + 30, seed + 21);
        this.forest[j * this.cols + i] =
          !open && f > 1 - p.forest * 1.15 && (p.river === 0 || Math.abs(z - this.riverCenter(x)) > p.river + 6) ? 1 : 0;
      }
    }
  }

  /** 川の中心線の位置(東西の位置 x に対する z) */
  riverCenter(x: number): number {
    return 12 * Math.sin(x / 55 + (this.seed % 7));
  }

  /** 地面の高さ */
  heightAt(x: number, z: number): number {
    const fx = Math.max(0, Math.min(this.cols - 1.001, (x + FIELD.width / 2) / CELL));
    const fz = Math.max(0, Math.min(this.rows - 1.001, (z + FIELD.depth / 2) / CELL));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = this.heights;
    const c = this.cols;
    return (
      (h[j * c + i] * (1 - tx) + h[j * c + i + 1] * tx) * (1 - tz) +
      (h[(j + 1) * c + i] * (1 - tx) + h[(j + 1) * c + i + 1] * tx) * tz
    );
  }

  /** 森の中か */
  inForest(x: number, z: number): boolean {
    const i = Math.round((x + FIELD.width / 2) / CELL);
    const j = Math.round((z + FIELD.depth / 2) / CELL);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return false;
    return this.forest[j * this.cols + i] === 1;
  }

  /** 川の中か。浅瀬(戦場の中央付近)では半分の深さとして 0.5 を返す */
  waterAt(x: number, z: number): number {
    if (this.riverWidth === 0) return 0;
    const d = Math.abs(z - this.riverCenter(x));
    if (d > this.riverWidth * 0.8) return 0;
    return Math.abs(x) < 28 ? 0.5 : 1;
  }
}
