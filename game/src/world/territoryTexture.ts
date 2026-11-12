// 領土の計算結果(マスごとの勢力)を、地形に重ねる絵にする。
//   赤・緑・青 = 勢力の色 / 透明度 = いちばん近い境界までの距離
// 境界までの距離を持たせることで、拡大しても境界線がぼやけず、細い線のまま描ける。
import * as THREE from "three";
import type { TerrainGrid } from "../sim/TerrainGrid";
import type { Territory } from "../sim/Territory";

/** 計算用のマス1つを、縦横この数の点に細かくする(境界をなめらかにするため) */
const SCALE = 6;
/** 境界からこの点数ぶん離れると、距離の値が上限になる */
export const TERRITORY_EDGE_RANGE = 12;

export class TerritoryTexture {
  readonly texture: THREE.DataTexture;
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8Array;

  constructor(private readonly grid: TerrainGrid) {
    this.width = grid.cols * SCALE;
    this.height = grid.rows * SCALE;
    this.data = new Uint8Array(this.width * this.height * 4);
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
  }

  /** 領土の計算結果から、絵を描き直す。colors は勢力の色(territory.factionIds と同じ順) */
  update(territory: Territory, colors: THREE.Color[]): void {
    const { cols, rows } = this.grid;
    const W = this.width;
    const H = this.height;
    const factions = colors.length;

    // 1. 勢力ごとに「支配している = 1」の表を作り、ぼかして角を丸める
    const masks: Float32Array[] = [];
    const tmp = new Float32Array(cols * rows);
    for (let f = 1; f <= factions; f++) {
      const m = new Float32Array(cols * rows);
      for (let k = 0; k < m.length; k++) m[k] = territory.owners[k] === f ? 1 : 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            let sum = 0;
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                sum += m[ny * cols + nx];
                n++;
              }
            }
            tmp[y * cols + x] = sum / n;
          }
        }
        m.set(tmp);
      }
      masks.push(m);
    }

    // 2. 細かい点ごとに、いちばん強い勢力を選ぶ(なめらかな輪郭になる)
    const owner = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const gy = Math.max(0, Math.min(rows - 1.001, (y + 0.5) / SCALE - 0.5));
      const j = Math.floor(gy);
      const ty = gy - j;
      for (let x = 0; x < W; x++) {
        const gx = Math.max(0, Math.min(cols - 1.001, (x + 0.5) / SCALE - 0.5));
        const i = Math.floor(gx);
        const tx = gx - i;
        let best = 0;
        let bestV = 0.5; // これより弱ければ空白地
        for (let f = 0; f < factions; f++) {
          const m = masks[f];
          const v =
            (m[j * cols + i] * (1 - tx) + m[j * cols + i + 1] * tx) * (1 - ty) +
            (m[(j + 1) * cols + i] * (1 - tx) + m[(j + 1) * cols + i + 1] * tx) * ty;
          if (v > bestV) {
            bestV = v;
            best = f + 1;
          }
        }
        owner[y * W + x] = best;
      }
    }

    // 3. 隣と勢力が違う点を「境界」として、すべての点から境界までの距離を求める
    const dist = new Float32Array(W * H).fill(1e6);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = owner[y * W + x];
        if ((x + 1 < W && owner[y * W + x + 1] !== o) || (y + 1 < H && owner[(y + 1) * W + x] !== o)) {
          dist[y * W + x] = 0.5;
          if (x + 1 < W) dist[y * W + x + 1] = Math.min(dist[y * W + x + 1], 0.5);
          if (y + 1 < H) dist[(y + 1) * W + x] = Math.min(dist[(y + 1) * W + x], 0.5);
        }
      }
    }
    const relax = (k: number, n: number, step: number): void => {
      if (dist[n] + step < dist[k]) dist[k] = dist[n] + step;
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (x > 0) relax(k, k - 1, 1);
        if (y > 0) relax(k, k - W, 1);
        if (x > 0 && y > 0) relax(k, k - W - 1, 1.414);
        if (x + 1 < W && y > 0) relax(k, k - W + 1, 1.414);
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const k = y * W + x;
        if (x + 1 < W) relax(k, k + 1, 1);
        if (y + 1 < H) relax(k, k + W, 1);
        if (x + 1 < W && y + 1 < H) relax(k, k + W + 1, 1.414);
        if (x > 0 && y + 1 < H) relax(k, k + W - 1, 1.414);
      }
    }

    // 距離をならして、境界線が階段状にならないようにする
    const smooth = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= W) continue;
              sum += dist[ny * W + nx];
              n++;
            }
          }
          smooth[y * W + x] = sum / n;
        }
      }
      dist.set(smooth);
    }

    // 4. 絵に書き込む
    for (let k = 0; k < W * H; k++) {
      const o = owner[k];
      if (o > 0) {
        const c = colors[o - 1];
        this.data[k * 4] = c.r * 255;
        this.data[k * 4 + 1] = c.g * 255;
        this.data[k * 4 + 2] = c.b * 255;
      } else {
        this.data[k * 4] = this.data[k * 4 + 1] = this.data[k * 4 + 2] = 0;
      }
      this.data[k * 4 + 3] = Math.min(1, dist[k] / TERRITORY_EDGE_RANGE) * 255;
    }
    this.texture.needsUpdate = true;
  }
}
