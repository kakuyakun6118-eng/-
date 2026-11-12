// 地形の通りにくさを考えて、いちばん早く着ける経路を探す(A*法)。
import type { TerrainGrid } from "./TerrainGrid";

const KM_PER_DEGREE = 111.19;

export interface RoutePoint {
  lon: number;
  lat: number;
}

/** 経路。points を順にたどって進む */
export interface Route {
  points: RoutePoint[];
  /** 道のりの長さ(km) */
  km: number;
  /** 各点までの「手間」の累計(km × 通りにくさ)。行軍の進み具合はこれで測る */
  effort: number[];
}

export function distanceKm(a: RoutePoint, b: RoutePoint): number {
  const dx = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const dy = b.lat - a.lat;
  return Math.hypot(dx, dy) * KM_PER_DEGREE;
}

/** いちばん小さい値をすばやく取り出せる入れ物 */
class MinHeap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.ids[0];
    const id = this.ids.pop()!;
    const key = this.keys.pop()!;
    const n = this.ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c++;
        if (this.keys[c] >= key) break;
        this.ids[i] = this.ids[c];
        this.keys[i] = this.keys[c];
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }
}

/** 通れないマスが指定されたとき、近くの通れるマスを探す */
function nearestPassable(grid: TerrainGrid, i: number, j: number): [number, number] | null {
  for (let r = 0; r <= 4; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = Math.max(0, j - r); y <= Math.min(grid.rows - 1, j + r); y++) {
      for (let x = Math.max(0, i - r); x <= Math.min(grid.cols - 1, i + r); x++) {
        if (!isFinite(grid.costs[y * grid.cols + x])) continue;
        const d = Math.hypot(x - i, y - j);
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** from から to への経路を探す。行けないときは null */
export function findRoute(grid: TerrainGrid, from: RoutePoint, to: RoutePoint): Route | null {
  const start = nearestPassable(grid, ...grid.cellOf(from.lon, from.lat));
  const goal = nearestPassable(grid, ...grid.cellOf(to.lon, to.lat));
  if (!start || !goal) return null;
  const { cols, rows, costs } = grid;
  const startId = start[1] * cols + start[0];
  const goalId = goal[1] * cols + goal[0];
  const goalExact = isFinite(grid.costAt(to.lon, to.lat));

  const midLat = (from.lat + to.lat) / 2;
  const kmX = grid.step * KM_PER_DEGREE * Math.cos(midLat * (Math.PI / 180));
  const kmY = grid.step * KM_PER_DEGREE;
  const minCost = 0.85;
  const estimate = (id: number): number => {
    const dx = ((id % cols) - goal[0]) * kmX;
    const dy = (Math.floor(id / cols) - goal[1]) * kmY;
    return Math.hypot(dx, dy) * minCost;
  };

  const best = new Float32Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const heap = new MinHeap();
  best[startId] = 0;
  heap.push(startId, estimate(startId));

  while (heap.size > 0) {
    const id = heap.pop();
    if (id === goalId) break;
    const x = id % cols;
    const y = Math.floor(id / cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nid = ny * cols + nx;
        if (!isFinite(costs[nid])) continue;
        if (dx !== 0 && dy !== 0) {
          // 斜めに進むとき、川や海の角をすり抜けないようにする
          const a = y * cols + nx;
          const b = ny * cols + x;
          if (grid.isRiverCell(a) || grid.isRiverCell(b)) continue;
        }
        const km = Math.hypot(dx * kmX, dy * kmY);
        const g = best[id] + km * (costs[id] + costs[nid]) * 0.5;
        if (g < best[nid]) {
          best[nid] = g;
          prev[nid] = id;
          heap.push(nid, g + estimate(nid));
        }
      }
    }
  }
  if (!isFinite(best[goalId])) return null;

  // 終点から逆にたどって、経路を取り出す
  const cells: number[] = [];
  for (let id = goalId; id !== -1; id = prev[id]) cells.push(id);
  cells.reverse();
  let points: RoutePoint[] = cells.map((id) => grid.centerOf(id % cols, Math.floor(id / cols)));
  points[0] = { ...from };
  if (goalExact) points[points.length - 1] = { ...to };

  // マス目に沿ったギザギザを、2回ならして滑らかにする(始点と終点は動かさない)
  for (let pass = 0; pass < 2; pass++) {
    points = points.map((p, k) =>
      k === 0 || k === points.length - 1
        ? p
        : {
            lon: (points[k - 1].lon + p.lon * 2 + points[k + 1].lon) / 4,
            lat: (points[k - 1].lat + p.lat * 2 + points[k + 1].lat) / 4,
          },
    );
  }

  let km = 0;
  const effort = [0];
  for (let k = 1; k < points.length; k++) {
    const d = distanceKm(points[k - 1], points[k]);
    const mid = { lon: (points[k - 1].lon + points[k].lon) / 2, lat: (points[k - 1].lat + points[k].lat) / 2 };
    const cost = grid.costAt(mid.lon, mid.lat);
    km += d;
    effort.push(effort[k - 1] + d * (isFinite(cost) ? cost : 5));
  }
  return { points, km, effort };
}
