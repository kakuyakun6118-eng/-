// 進軍の計算用に、地形を約11km四方のマスに分けて種類を決める。
// 3D表示とは別物で、ここは「どこが通りやすいか」だけを扱う。
import { terrainRules } from "../data";
import type { Crossing, TerrainKind } from "../data/types";
import type { HeightField } from "../world/heightField";

/** マス1つの大きさ(度) */
const STEP = 0.1;
/** 渡河地点からこの距離(度)までの大河のマスを、渡れるようにする */
const CROSSING_REACH = 0.3;

const KINDS: TerrainKind[] = [
  "plain", "grassland", "desert", "forest", "hill", "mountain", "highMountain",
  "river", "crossing", "greatRiver", "water",
];

export class TerrainGrid {
  readonly cols: number;
  readonly rows: number;
  readonly step = STEP;
  /** 各マスの地形の種類(KINDS の番号) */
  private readonly kinds: Uint8Array;
  /** 各マスの通りにくさ(通れないマスは Infinity) */
  readonly costs: Float32Array;
  private road!: Uint8Array;
  private readonly west: number;
  private readonly north: number;

  constructor(field: HeightField, crossings: Crossing[]) {
    const b = field.region.info.bounds;
    this.west = b.west;
    this.north = b.north;
    this.cols = Math.round((b.east - b.west) / STEP);
    this.rows = Math.round((b.north - b.south) / STEP);
    this.kinds = new Uint8Array(this.cols * this.rows);
    this.costs = new Float32Array(this.cols * this.rows);
    this.road = new Uint8Array(this.cols * this.rows);

    const pxPerCellX = field.width / this.cols;
    const pxPerCellY = field.height / this.rows;
    for (let j = 0; j < this.rows; j++) {
      const y0 = Math.floor(j * pxPerCellY);
      const y1 = Math.min(field.height - 1, Math.floor((j + 1) * pxPerCellY));
      const lat = b.north - (j + 0.5) * STEP;
      for (let i = 0; i < this.cols; i++) {
        const x0 = Math.floor(i * pxPerCellX);
        const x1 = Math.min(field.width - 1, Math.floor((i + 1) * pxPerCellX));
        const lon = b.west + (i + 0.5) * STEP;
        // マスの中の標高の最大・最小、水辺の値の最大、海の割合を調べる
        let lo = Infinity;
        let hi = -Infinity;
        let water = 0;
        let sea = 0;
        let n = 0;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const m = field.meters[y * field.width + x];
            if (m < lo) lo = m;
            if (m > hi) hi = m;
            const w = field.water[y * field.width + x];
            if (w > water) water = w;
            if (m === 0) sea++;
            n++;
          }
        }
        const relief = hi - lo; // 起伏(メートル)
        // 乾燥の度合い(地形の塗り分けと同じ考え方:北西ほど乾く)
        const dry = Math.max(0, Math.min(1, (lat - 36.5) * 0.16 + (110 - lon) * 0.09));

        let kind: TerrainKind;
        if (sea / n > 0.5) kind = "water";
        else if (water >= 150) kind = "greatRiver";
        else if (water > 128) kind = "river";
        else if (relief >= 900) kind = "highMountain";
        else if (relief >= 500) kind = "mountain";
        else if (relief >= 180) kind = "hill";
        else if (dry >= 0.62) kind = "desert";
        else if (relief >= 100 && dry < 0.35) kind = "forest";
        else if (dry >= 0.22) kind = "grassland";
        else kind = "plain";
        this.kinds[j * this.cols + i] = KINDS.indexOf(kind);
      }
    }

    // 渡河地点の近くの大河は渡れるようにする
    const greatRiver = KINDS.indexOf("greatRiver");
    const crossing = KINDS.indexOf("crossing");
    for (const c of crossings) {
      const [ci, cj] = this.cellOf(c.lon, c.lat);
      const r = Math.ceil(CROSSING_REACH / STEP);
      for (let j = Math.max(0, cj - r); j <= Math.min(this.rows - 1, cj + r); j++) {
        for (let i = Math.max(0, ci - r); i <= Math.min(this.cols - 1, ci + r); i++) {
          if (this.kinds[j * this.cols + i] === greatRiver) this.kinds[j * this.cols + i] = crossing;
        }
      }
    }

    for (let k = 0; k < this.kinds.length; k++) {
      this.costs[k] = terrainRules[KINDS[this.kinds[k]]].cost ?? Infinity;
    }
  }

  /** 街道の通るマスを、通りやすくする(通れないマスは変えない) */
  markRoad(lon: number, lat: number, factor: number): void {
    const [i, j] = this.cellOf(lon, lat);
    const k = j * this.cols + i;
    if (this.road[k] || !isFinite(this.costs[k])) return;
    this.road[k] = 1;
    this.costs[k] = Math.max(0.55, this.costs[k] * factor);
  }

  /** その場所に街道が通っているか */
  onRoad(lon: number, lat: number): boolean {
    const [i, j] = this.cellOf(lon, lat);
    return this.road[j * this.cols + i] === 1;
  }

  /** 緯度経度が、どのマス(列, 行)にあたるか */
  cellOf(lon: number, lat: number): [number, number] {
    return [
      Math.max(0, Math.min(this.cols - 1, Math.floor((lon - this.west) / STEP))),
      Math.max(0, Math.min(this.rows - 1, Math.floor((this.north - lat) / STEP))),
    ];
  }

  /** マスの中心の緯度経度 */
  centerOf(i: number, j: number): { lon: number; lat: number } {
    return { lon: this.west + (i + 0.5) * STEP, lat: this.north - (j + 0.5) * STEP };
  }

  kindAt(lon: number, lat: number): TerrainKind {
    const [i, j] = this.cellOf(lon, lat);
    return KINDS[this.kinds[j * this.cols + i]];
  }

  costAt(lon: number, lat: number): number {
    const [i, j] = this.cellOf(lon, lat);
    return this.costs[j * this.cols + i];
  }

  /** 川に関わるマスか(斜めにすり抜けるのを防ぐために使う) */
  isRiverCell(index: number): boolean {
    const k = KINDS[this.kinds[index]];
    return k === "river" || k === "greatRiver" || k === "crossing" || k === "water";
  }
}
