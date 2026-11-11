// 山脈・高原・川・海のデータから、地形の「高さの表」を作る。
// 将来、本物の標高データに差し替えるときは、このファイルだけ交換すればよい。
import { LON_SCALE } from "../core/geo";
import { fbm } from "../core/noise";
import type { LonLatPair, RegionData } from "../data/types";

/** 点から折れ線までの距離(緯度の度数に換算) */
function distToPolyline(lon: number, lat: number, pts: LonLatPair[], closed = false): number {
  let best = Infinity;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ax = (a[0] - lon) * LON_SCALE;
    const ay = a[1] - lat;
    const bx = (b[0] - lon) * LON_SCALE;
    const by = b[1] - lat;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d2 = px * px + py * py;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

function insidePolygon(lon: number, lat: number, poly: LonLatPair[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** ある地点の高さを計算する(0 = 海面、1 ≒ 標高1000m のつもり) */
function computeHeight(lon: number, lat: number, region: RegionData): number {
  const { highlands, ridges, seas } = region.terrain;

  for (const sea of seas) {
    if (insidePolygon(lon, lat, sea.polygon)) return 0;
  }

  // 平原の基本の高さ + ゆるやかな起伏
  let h = 0.1 + 0.12 * fbm(lon * 1.5, lat * 1.5);

  // 高原:広く平らに盛り上げる
  for (const hl of highlands) {
    const dx = (lon - hl.center[0]) / hl.radius[0];
    const dy = (lat - hl.center[1]) / hl.radius[1];
    const q = dx * dx + dy * dy;
    if (q < 4) {
      h += hl.height * Math.exp(-q * q) * (0.85 + 0.3 * fbm(lon * 2 + 50, lat * 2));
    }
  }

  // 山脈:線に近いほど高くする
  for (const r of ridges) {
    const d = distToPolyline(lon, lat, r.points);
    if (d < r.width * 3) {
      const k = d / r.width;
      h += r.height * Math.exp(-k * k) * (0.55 + 0.9 * fbm(lon * 4, lat * 4));
    }
  }

  // 川:川の近くは谷として低くする
  let carve = 0;
  for (const river of region.rivers) {
    const d = distToPolyline(lon, lat, river.points);
    if (d < 0.5) {
      const k = d / 0.14;
      carve = Math.max(carve, Math.exp(-k * k));
    }
  }
  h *= 1 - 0.65 * carve;

  // 海岸:海に近いほど低くして、なだらかに海へつなぐ
  for (const sea of seas) {
    const d = distToPolyline(lon, lat, sea.polygon, true);
    h *= 0.15 + 0.85 * smoothstep(0, 0.6, d);
  }

  return h;
}

/** 地域全体の高さを格子状に並べた表 */
export class HeightField {
  readonly cols: number;
  readonly rows: number;
  readonly data: Float32Array;

  constructor(readonly region: RegionData) {
    const { bounds, gridStep } = region.info;
    this.cols = Math.round((bounds.east - bounds.west) / gridStep) + 1;
    this.rows = Math.round((bounds.north - bounds.south) / gridStep) + 1;
    this.data = new Float32Array(this.cols * this.rows);
    // 行は北から南へ、列は西から東へ並べる
    for (let j = 0; j < this.rows; j++) {
      const lat = bounds.north - j * gridStep;
      for (let i = 0; i < this.cols; i++) {
        const lon = bounds.west + i * gridStep;
        this.data[j * this.cols + i] = computeHeight(lon, lat, region);
      }
    }
  }

  /** 好きな地点の高さを、まわりの格子からなめらかに求める */
  sample(lon: number, lat: number): number {
    const { bounds, gridStep } = this.region.info;
    const fx = Math.max(0, Math.min(this.cols - 1.001, (lon - bounds.west) / gridStep));
    const fy = Math.max(0, Math.min(this.rows - 1.001, (bounds.north - lat) / gridStep));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const d = this.data;
    const c = this.cols;
    const top = d[j * c + i] * (1 - tx) + d[j * c + i + 1] * tx;
    const bottom = d[(j + 1) * c + i] * (1 - tx) + d[(j + 1) * c + i + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  }
}
