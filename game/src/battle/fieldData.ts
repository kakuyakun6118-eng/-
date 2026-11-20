// 戦場の地形データ。会戦地点の緯度経度から、実物の標高・土地被覆・水域を読み込んで作る。
// 乱数で地形を作ることはしない。高解像度のデータ(AW3D30)が未収録の地点では、
// 戦略マップの実標高(低解像度)を使い、そのことを画面に明示する。
//
// 座標の決まり:会戦地点が原点。-z が「攻撃側から見た防御側の方角」、+x がその右手。
// 長さの単位は、戦場の長さ1 = METERS_PER_UNIT メートル(兵士1体が十数人分にあたるのに合わせた縮尺)。
import { findBattlefieldSite, type BattlefieldSite } from "../data/battlefields";
import type { HeightField } from "../world/heightField";
import { FIELD } from "./deploy";

/** 戦場の長さ1が、実際の何メートルにあたるか */
export const METERS_PER_UNIT = 12;
/**
 * 高さの倍率。1 = 水平と同じ比率(実際の地形のまま)。
 * 起伏を見やすくしたいときだけ、1.5 程度まで上げる。
 */
export const VERTICAL_EXAGGERATION = 1;
/** 景色として作る範囲の半分(戦場の長さ)。600 × 12m = 中心から7.2km */
export const VIEW_HALF = 600;
const CELL = 4;
const N = (VIEW_HALF * 2) / CELL + 1;
const METERS_PER_DEGREE = 111190;

/** 土地被覆の番号(tools/bake_battlefield.py と同じ) */
export const COVER = { grass: 0, tree: 1, shrub: 2, bare: 3, water: 4, wetland: 5 } as const;

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

/** なめらかなノイズ(0〜1)。地表の色むらや木の配置にだけ使う。地形の高さには使わない */
export function fbm(x: number, y: number, seed: number): number {
  return noise(x, y, seed) * 0.55 + noise(x * 2.1, y * 2.1, seed + 7) * 0.3 + noise(x * 4.3, y * 4.3, seed + 13) * 0.15;
}

function loadPixels(url: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const out = { data, width: canvas.width, height: canvas.height };
      canvas.width = canvas.height = 0; // 読み終わったら、すぐにメモリを返す
      resolve(out);
    };
    img.onerror = () => reject(new Error("戦場の地形データを読み込めませんでした"));
    img.src = url;
  });
}

/** 地形データの出どころ(画面に表示する) */
export interface FieldInfo {
  /** aw3d30 = 高解像度の実標高 / coarse = 戦略マップの実標高(低解像度) */
  source: "aw3d30" | "coarse";
  label: string;
  /** 景色の範囲の標高(メートル) */
  minMeters: number;
  maxMeters: number;
  /** 景色の範囲の平均の標高(メートル)。地域の景観を選ぶのに使う */
  meanMeters: number;
}

export class FieldMap {
  /** 各点の高さ(戦場の長さ。会戦地点を0とする) */
  private readonly heights = new Float32Array(N * N);
  private readonly slopes = new Float32Array(N * N);
  private readonly cover = new Uint8Array(N * N);
  /** 0 = 陸 / 1 = 浅瀬 / 2 = 深い水 */
  private readonly water = new Uint8Array(N * N);
  private baseMeters = 0;
  info!: FieldInfo;

  private constructor(
    readonly lon: number, readonly lat: number,
    /** 攻撃側から見た防御側の方角(ラジアン。0 = 北、時計回り) */
    readonly bearing: number,
    private readonly coarse: HeightField,
  ) {}

  /** 緯度経度が、戦場のどの位置 (x, z) にあたるか(toLonLat の逆) */
  fromLonLat(lon: number, lat: number): { x: number; z: number } {
    const cos = Math.cos(this.bearing);
    const sin = Math.sin(this.bearing);
    const east = (lon - this.lon) * METERS_PER_DEGREE * Math.cos((this.lat * Math.PI) / 180);
    const north = (lat - this.lat) * METERS_PER_DEGREE;
    return { x: (east * cos - north * sin) / METERS_PER_UNIT, z: (-east * sin - north * cos) / METERS_PER_UNIT };
  }

  /** 道(Version 42):1 なら道の上 */
  readonly road = new Uint8Array(N * N);
  /** 浅瀬(渡し場。Version 42):1 なら、深い川を渡れる浅瀬 */
  readonly ford = new Uint8Array(N * N);
  /** 戦場にある浅瀬の場所と名前(史料の渡しなら名前つき) */
  fords: { x: number; z: number; name?: string }[] = [];

  /**
   * 道と浅瀬を戦場に入れる(Version 42)。道は戦略マップの道すじ、浅瀬は史料の渡し(crossings)の地点と、
   * 道が川を渡る所。戦場に深い川があるのに渡れる所がなければ、川幅のいちばん狭い所を浅瀬にする(2か所まで)。
   */
  addFeatures(roads: { lon: number; lat: number }[][], crossings: { name: string; lon: number; lat: number }[]): void {
    const mark = (cx: number, cz: number, r: number, f: (k: number) => void): void => {
      const i0 = Math.round((cx + VIEW_HALF) / CELL), j0 = Math.round((cz + VIEW_HALF) / CELL), rr = Math.ceil(r / CELL);
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || Math.hypot(di, dj) * CELL > r) continue;
        f(j * N + i);
      }
    };
    /**
     * 浅瀬:その点から、川幅のいちばん狭い向き(16方向から選ぶ)に、岸から岸までの帯(幅約14 = 約170m)を浅くする。
     * 岸まで遠すぎる(800超)大河では、点のまわりだけを浅くする(中州の浅瀬)。
     */
    const makeFord = (x: number, z: number, r: number, name?: string): void => {
      let best: { dx: number; dz: number; a: number; b: number } | null = null;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI;
        const dx = Math.cos(ang), dz = Math.sin(ang);
        const run = (sgn: number): number => {
          for (let t = 0; t < 800; t += 2) if (this.waterAt(x + dx * t * sgn, z + dz * t * sgn) === 0) return t;
          return 9999;
        };
        const a = run(1), b = run(-1);
        if (a + b < 1600 && (!best || a + b < best.a + best.b)) best = { dx, dz, a, b };
      }
      let any = false;
      const carve = (k: number): void => {
        if (this.water[k] === 2) { this.water[k] = 1; this.ford[k] = 1; any = true; }
        else if (this.water[k] === 1) this.ford[k] = 1;
      };
      if (best) for (let t = -best.b - 4; t <= best.a + 4; t += 2) mark(x + best.dx * t, z + best.dz * t, Math.max(7, r * 0.5), carve);
      else mark(x, z, r, carve);
      if (any && !this.fords.some((f) => Math.hypot(f.x - x, f.z - z) < 60)) this.fords.push({ x, z, name });
    };
    const inside = (p: { x: number; z: number }, pad = 40): boolean => Math.abs(p.x) <= VIEW_HALF + pad && Math.abs(p.z) <= VIEW_HALF + pad;
    // 道:点と点のあいだを2ずつ進んで、幅約3(約36m)の帯にする。道が深い川にかかる所は浅瀬(渡し)。
    // 川岸に沿って道が続く所で浅瀬だらけにならないよう、川にかかる点を150の範囲でまとめ、3か所までにする
    const wetHits: { x: number; z: number; n: number; x0: number; z0: number }[] = [];
    for (const line of roads) {
      const pts = line.map((p) => this.fromLonLat(p.lon, p.lat));
      for (let n = 1; n < pts.length; n++) {
        const a = pts[n - 1], b = pts[n];
        if (!inside(a, 400) && !inside(b, 400)) continue;
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        for (let t = 0; t <= len; t += 2) {
          const x = a.x + ((b.x - a.x) * t) / len, z = a.z + ((b.z - a.z) * t) / len;
          if (!inside({ x, z }, 0)) continue;
          let wet = false;
          mark(x, z, 3, (k) => { if (this.water[k] === 2) wet = true; else if (this.water[k] === 0) this.road[k] = 1; });
          if (wet) {
            const h = wetHits.find((q) => Math.hypot(q.x / q.n - x, q.z / q.n - z) < 150);
            if (h) { h.x += x; h.z += z; h.n++; } else wetHits.push({ x, z, n: 1, x0: x, z0: z });
          }
        }
      }
    }
    // 道が短く川に触れるだけの所(まとまりの小さい所)を先に:川を横切る渡しほど、触れる点は少ない
    for (const h of wetHits.sort((a, b) => a.n - b.n).slice(0, 3)) makeFord(h.x0, h.z0, 12);
    // 史料の渡し
    for (const c of crossings) {
      const p = this.fromLonLat(c.lon, c.lat);
      if (!inside(p, 0)) continue;
      // 渡しの点に近い深い水を探して、そこを浅瀬にする
      let best: { x: number; z: number } | null = null, bd = 80;
      for (let dz = -80; dz <= 80; dz += 4) for (let dx = -80; dx <= 80; dx += 4) {
        if (this.waterAt(p.x + dx, p.z + dz) < 1) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) { bd = d; best = { x: p.x + dx, z: p.z + dz }; }
      }
      if (best) makeFord(best.x, best.z, 14, c.name);
    }
    // 渡れる所のない深い川:川幅のいちばん狭い所を、浅瀬にする(2か所まで)
    const deep: { x: number; z: number; w: number }[] = [];
    for (let j = 0; j < N; j += 6) for (let i = 0; i < N; i += 6) {
      if (this.water[j * N + i] !== 2) continue;
      let w = 999;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let n = 1;
        for (const s of [1, -1]) for (let t = 1; t < 60; t++) {
          const x = i + di * t * s, y = j + dj * t * s;
          if (x < 0 || y < 0 || x >= N || y >= N || this.water[y * N + x] === 0) break;
          n++;
        }
        w = Math.min(w, n * CELL * Math.hypot(di, dj));
      }
      deep.push({ x: i * CELL - VIEW_HALF, z: j * CELL - VIEW_HALF, w });
    }
    // 部隊を動かせる戦場の中に、深い川があって浅瀬がないときだけ、川幅の狭い所に作る
    const inField = (f: { x: number; z: number }): boolean => Math.abs(f.x) <= FIELD.width / 2 + 20 && Math.abs(f.z) <= FIELD.depth / 2 + 20;
    if (deep.length && !this.fords.some(inField)) {
      deep.sort((a, b) => a.w - b.w);
      const picked: { x: number; z: number }[] = [];
      for (const d of deep) {
        if (picked.length >= 2) break;
        if (picked.some((p) => Math.hypot(p.x - d.x, p.z - d.z) < 200)) continue;
        // 部隊を動かせる戦場の中(少し外まで)を選ぶ
        if (Math.abs(d.x) > FIELD.width / 2 + 20 || Math.abs(d.z) > FIELD.depth / 2 + 20) continue;
        picked.push(d);
        makeFord(d.x, d.z, Math.min(30, d.w * 0.6 + 8));
      }
    }
  }

  /** 道の上か */
  onRoad(x: number, z: number): boolean {
    return this.road[this.index(x, z)] === 1;
  }

  /** 浅瀬(渡し場)か */
  onFord(x: number, z: number): boolean {
    return this.ford[this.index(x, z)] === 1;
  }

  /** 戦場の位置 (x, z) が、実際のどの緯度経度にあたるか */
  toLonLat(x: number, z: number): { lon: number; lat: number } {
    const cos = Math.cos(this.bearing);
    const sin = Math.sin(this.bearing);
    const east = (x * cos - z * sin) * METERS_PER_UNIT;
    const north = (-x * sin - z * cos) * METERS_PER_UNIT;
    return {
      lon: this.lon + east / (METERS_PER_DEGREE * Math.cos((this.lat * Math.PI) / 180)),
      lat: this.lat + north / METERS_PER_DEGREE,
    };
  }

  /** 会戦地点の実地形を読み込んで、戦場の地形データを作る */
  static async load(lon: number, lat: number, bearing: number, coarse: HeightField): Promise<FieldMap> {
    const field = new FieldMap(lon, lat, bearing, coarse);
    // 景色の範囲(回転しても収まるよう、対角線ぶんの余裕を取る)が、まるごと収録されているか
    const reach = (VIEW_HALF * Math.SQRT2 * METERS_PER_UNIT) / METERS_PER_DEGREE;
    const site = findBattlefieldSite(lon, lat, reach / Math.cos((lat * Math.PI) / 180), reach);
    const meters = new Float32Array(N * N);
    if (site) {
      await field.readSite(site, meters);
      field.info = { source: "aw3d30", label: "実標高 AW3D30(約30m)", minMeters: 0, maxMeters: 0, meanMeters: 0 };
    } else {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const p = field.toLonLat(i * CELL - VIEW_HALF, j * CELL - VIEW_HALF);
          meters[j * N + i] = coarse.sample(p.lon, p.lat);
          field.cover[j * N + i] = coarse.isWater(p.lon, p.lat) ? COVER.water : COVER.grass;
        }
      }
      field.info = { source: "coarse", label: "実標高(低解像度 約1.4km)・この地点の30mデータは未収録", minMeters: 0, maxMeters: 0, meanMeters: 0 };
    }
    field.finish(meters, site !== null);
    return field;
  }

  /** 収録範囲の画像から、戦場の向きに合わせて標高・土地被覆・水域を読み取る */
  private async readSite(site: BattlefieldSite, meters: Float32Array): Promise<void> {
    const [terrain, water] = await Promise.all([loadPixels(site.terrainUrl), loadPixels(site.waterUrl)]);
    const b = site.bounds;
    const W = terrain.width;
    const H = terrain.height;
    const elev = (i: number, j: number): number => terrain.data[(j * W + i) * 4] * 256 + terrain.data[(j * W + i) * 4 + 1];
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p = this.toLonLat(i * CELL - VIEW_HALF, j * CELL - VIEW_HALF);
        const fx = Math.max(0, Math.min(W - 1.001, ((p.lon - b.west) / (b.east - b.west)) * (W - 1)));
        const fy = Math.max(0, Math.min(H - 1.001, ((b.north - p.lat) / (b.north - b.south)) * (H - 1)));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        meters[j * N + i] =
          (elev(x0, y0) * (1 - tx) + elev(x0 + 1, y0) * tx) * (1 - ty) +
          (elev(x0, y0 + 1) * (1 - tx) + elev(x0 + 1, y0 + 1) * tx) * ty;
        const nx = Math.round(fx);
        const ny = Math.round(fy);
        const isWater = water.data[(ny * water.width + nx) * 4] > 127;
        this.cover[j * N + i] = isWater ? COVER.water : terrain.data[(ny * W + nx) * 4 + 2];
      }
    }
  }

  /** 読み取った標高から、高さ・傾き・水の深さを計算する */
  private finish(meters: Float32Array, smooth: boolean): void {
    // AW3D30は地表面の高さ(木や建物を含む)なので、細かいでこぼこを軽くならす
    if (smooth) {
      const tmp = new Float32Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let sum = 0;
          let n = 0;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const x = i + di;
              const y = j + dj;
              if (x < 0 || y < 0 || x >= N || y >= N) continue;
              const w = di === 0 && dj === 0 ? 4 : 1;
              sum += meters[y * N + x] * w;
              n += w;
            }
          }
          tmp[j * N + i] = sum / n;
        }
      }
      meters.set(tmp);
    }
    const c = Math.floor(N / 2);
    this.baseMeters = meters[c * N + c];
    let lo = Infinity;
    let hi = -Infinity;
    const k = VERTICAL_EXAGGERATION / METERS_PER_UNIT;
    for (let n = 0; n < N * N; n++) {
      lo = Math.min(lo, meters[n]);
      hi = Math.max(hi, meters[n]);
      this.heights[n] = (meters[n] - this.baseMeters) * k;
    }
    this.info.meanMeters = Math.round(meters.reduce((sum, v) => sum + v, 0) / meters.length);
    this.info.minMeters = Math.round(lo);
    this.info.maxMeters = Math.round(hi);

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const l = this.heights[j * N + Math.max(0, i - 1)];
        const r = this.heights[j * N + Math.min(N - 1, i + 1)];
        const u = this.heights[Math.max(0, j - 1) * N + i];
        const d = this.heights[Math.min(N - 1, j + 1) * N + i];
        this.slopes[j * N + i] = Math.hypot(r - l, d - u) / (2 * CELL) / VERTICAL_EXAGGERATION;
        // 水:岸から100m以上離れた所は深く、渡れない。それ以外は浅瀬
        if (this.cover[j * N + i] !== COVER.water) continue;
        let wet = 0;
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const x = Math.max(0, Math.min(N - 1, i + di));
            const y = Math.max(0, Math.min(N - 1, j + dj));
            if (this.cover[y * N + x] === COVER.water) wet++;
          }
        }
        this.water[j * N + i] = wet >= 22 ? 2 : 1;
      }
    }
  }

  private index(x: number, z: number): number {
    const i = Math.max(0, Math.min(N - 1, Math.round((x + VIEW_HALF) / CELL)));
    const j = Math.max(0, Math.min(N - 1, Math.round((z + VIEW_HALF) / CELL)));
    return j * N + i;
  }

  /** 城壁など、地形以外の通れないもの(攻城戦で使う) */
  obstacle: ((x: number, z: number) => boolean) | null = null;

  /**
   * 城を建てる敷地を、平らにならす(整地)。
   * 実標高を、敷地の中心の高さにそろえる。縁はなだらかに元の地形へ戻す。
   */
  levelArea(cx: number, cz: number, width: number, depth: number): void {
    const base = this.heightAt(cx, cz);
    const margin = 26;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = i * CELL - VIEW_HALF;
        const z = j * CELL - VIEW_HALF;
        const out = Math.max(Math.abs(x - cx) - width / 2, Math.abs(z - cz) - depth / 2, 0);
        if (out >= margin) continue;
        const t = out / margin;
        const k = j * N + i;
        const w = 1 - t * t * (3 - 2 * t);
        this.heights[k] = this.heights[k] * (1 - w) + base * w;
        this.slopes[k] *= 1 - w;
        if (out === 0) {
          this.water[k] = 0;
          if (this.cover[k] === COVER.water || this.cover[k] === COVER.tree) this.cover[k] = COVER.bare;
        }
      }
    }
  }

  /** 地形データの格子の、1辺の点の数と間隔(描画用の絵を作るのに使う) */
  static readonly GRID = N;
  static readonly CELL = CELL;

  /** 地面の高さ(戦場の長さ) */
  heightAt(x: number, z: number): number {
    const fx = Math.max(0, Math.min(N - 1.001, (x + VIEW_HALF) / CELL));
    const fz = Math.max(0, Math.min(N - 1.001, (z + VIEW_HALF) / CELL));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = this.heights;
    return (
      (h[j * N + i] * (1 - tx) + h[j * N + i + 1] * tx) * (1 - tz) +
      (h[(j + 1) * N + i] * (1 - tx) + h[(j + 1) * N + i + 1] * tx) * tz
    );
  }

  /** 実際の標高(メートル) */
  metersAt(x: number, z: number): number {
    return this.baseMeters + (this.heightAt(x, z) * METERS_PER_UNIT) / VERTICAL_EXAGGERATION;
  }

  /** 景色の範囲の外(遠景)の高さ。戦略マップの実標高から求める */
  farHeightAt(x: number, z: number): number {
    const p = this.toLonLat(x, z);
    return ((this.coarse.sample(p.lon, p.lat) - this.baseMeters) * VERTICAL_EXAGGERATION) / METERS_PER_UNIT;
  }

  /** 傾き(高さ ÷ 水平距離。0.25 で約14度、0.5 で約27度) */
  slopeAt(x: number, z: number): number {
    return this.slopes[this.index(x, z)];
  }

  /** 土地被覆の番号 */
  coverAt(x: number, z: number): number {
    return this.cover[this.index(x, z)];
  }

  inForest(x: number, z: number): boolean {
    return this.cover[this.index(x, z)] === COVER.tree;
  }

  /** 水の深さ。0 = 陸 / 0.5 = 浅瀬(渡れるが遅い) / 1 = 深い水(渡れない) */
  waterAt(x: number, z: number): number {
    const w = this.water[this.index(x, z)];
    return w === 2 ? 1 : w === 1 ? 0.5 : 0;
  }

  /** その場所へ進めないか。深い水と、急すぎる斜面(騎兵は歩兵より緩い斜面で止まる)は通れない */
  blocked(x: number, z: number, cavalry: boolean): boolean {
    if (this.obstacle?.(x, z)) return true;
    if (Math.abs(x) > FIELD.width / 2 + 40) return false;
    const n = this.index(x, z);
    return this.water[n] === 2 || this.slopes[n] > (cavalry ? 0.45 : 0.8);
  }
}
