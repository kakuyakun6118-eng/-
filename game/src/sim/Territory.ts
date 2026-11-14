// 各勢力の領土を計算する。
// 支配している都市から「進軍のしやすさ」で周囲へ広がり、いちばん早く届く都市の勢力が
// その土地を支配する、と考える。山脈や大河は通りにくいので、自然に境界になる。
// 軍団の位置は関係しない。都市の所属が変わったときにだけ計算し直す。
import { cityLevelOf } from "../data";
import type { City } from "../data/types";
import { MinHeap } from "./pathfinding";
import type { TerrainGrid } from "./TerrainGrid";

const KM_PER_DEGREE = 111.19;
/** 都市の支配が届く限界(km × 通りにくさ)。これより遠い土地は、どの勢力のものでもない */
const REACH = 1500;
/** 小さい都市ほど、支配の届く範囲を狭くする(規模1〜4) */
const LEVEL_HANDICAP = [0, 200, 130, 60, 0];

export class Territory {
  /** 各マスを支配する勢力の番号(factionIds の何番目か + 1。0 は空白地) */
  readonly owners: Uint8Array;

  constructor(private readonly grid: TerrainGrid, readonly factionIds: string[]) {
    this.owners = new Uint8Array(grid.cols * grid.rows);
  }

  /** cityOwners(都市ID → 勢力ID)をもとに、領土を計算し直す */
  compute(cities: City[], cityOwners: Record<string, string>): void {
    const { cols, rows, costs } = this.grid;
    const n = cols * rows;
    const best = new Float64Array(n).fill(Infinity);
    this.owners.fill(0);

    // すべての都市から同時に広げていく(近い順に確定させる)
    const heap = new MinHeap();
    const done = new Uint8Array(n);
    const push = (id: number, d: number): void => heap.push(id, d);
    for (const city of cities) {
      const faction = this.factionIds.indexOf(cityOwners[city.id]) + 1;
      if (faction === 0) continue;
      const [ci, cj] = this.grid.cellOf(city.lon, city.lat);
      const id = cj * cols + ci;
      const d = LEVEL_HANDICAP[cityLevelOf(city)];
      if (d < best[id]) {
        best[id] = d;
        this.owners[id] = faction;
        push(id, d);
      }
    }

    const kmY = this.grid.step * KM_PER_DEGREE;
    while (heap.size > 0) {
      const id = heap.pop();
      if (done[id]) continue; // 同じマスが、遠い値で重ねて入っていることがある
      done[id] = 1;
      const d = best[id];
      const x = id % cols;
      const y = Math.floor(id / cols);
      const kmX = kmY * Math.cos((this.grid.centerOf(x, y).lat * Math.PI) / 180);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nid = ny * cols + nx;
          if (!isFinite(costs[nid])) continue;
          // 都市のあるマスが川の上でも広がれるよう、出発点の通りにくさは上限を付ける
          const from = isFinite(costs[id]) ? costs[id] : 1;
          if (dx !== 0 && dy !== 0 && (this.grid.isRiverCell(y * cols + nx) || this.grid.isRiverCell(ny * cols + x))) continue;
          const nd = d + Math.hypot(dx * kmX, dy * kmY) * (from + costs[nid]) * 0.5;
          if (nd < best[nid] && nd <= REACH) {
            best[nid] = nd;
            this.owners[nid] = this.owners[id];
            push(nid, nd);
          }
        }
      }
    }

    // 大河そのもののマスは通れないので空白のまま残る。隣の岸の勢力で埋めて、すき間をなくす
    for (let pass = 0; pass < 2; pass++) {
      const fill: [number, number][] = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const id = y * cols + x;
          if (this.owners[id] !== 0 || this.grid.kindAt(...this.lonLat(x, y)) !== "greatRiver") continue;
          for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const o = this.owners[ny * cols + nx];
            if (o !== 0) {
              fill.push([id, o]);
              break;
            }
          }
        }
      }
      for (const [id, o] of fill) this.owners[id] = o;
    }
  }

  private lonLat(x: number, y: number): [number, number] {
    const c = this.grid.centerOf(x, y);
    return [c.lon, c.lat];
  }

  /** ある地点を支配している勢力のID(空白地は null) */
  factionAt(lon: number, lat: number): string | null {
    const [i, j] = this.grid.cellOf(lon, lat);
    const o = this.owners[j * this.grid.cols + i];
    return o === 0 ? null : this.factionIds[o - 1];
  }
}
