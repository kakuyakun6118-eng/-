// 街道。都市と都市のつながり(roads.json)から、地形の通りやすい所をたどって道すじを決める。
// 道の上のマスは進軍が速くなり、地図には細い帯として描く。
import * as THREE from "three";
import { toWorld } from "../core/geo";
import type { City } from "../data/types";
import { findRoute, type RoutePoint } from "../sim/pathfinding";
import type { TerrainGrid } from "../sim/TerrainGrid";

/** 道の上を進むときの、通りにくさの倍率 */
const ROAD_FACTOR = 0.6;
const WIDTH = 0.09;

export class Roads {
  readonly group = new THREE.Group();
  /** 引けた道の数(動作確認用) */
  count = 0;
  /** 引けなかった道(都市ID-都市ID)。点検用 */
  readonly failed: string[] = [];

  constructor(links: string[][], places: City[], grid: TerrainGrid, heightAt: (lon: number, lat: number) => number) {
    const lines: RoutePoint[][] = [];
    // 先にすべての道すじを決めてから、通りやすさを書き換える(先に引いた道に、後の道が引き寄せられすぎないように)
    for (const [a, b] of links) {
      const from = places.find((c) => c.id === a);
      const to = places.find((c) => c.id === b);
      if (!from || !to) continue;
      const route = findRoute(grid, from, to);
      if (route) lines.push(route.points);
      else this.failed.push(`${a}-${b}`);
    }
    this.count = lines.length;
    for (const line of lines) for (const p of line) grid.markRoad(p.lon, p.lat, ROAD_FACTOR);

    // 道を、地面に沿った細い帯として描く
    const pos: number[] = [];
    const idx: number[] = [];
    for (const line of lines) {
      const pts = line.map((p) => {
        const w = toWorld(p.lon, p.lat);
        return new THREE.Vector3(w.x, heightAt(p.lon, p.lat) + 0.035, w.z);
      });
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const dx = next.x - prev.x;
        const dz = next.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = (-dz / len) * WIDTH;
        const nz = (dx / len) * WIDTH;
        const base = pos.length / 3;
        pos.push(pts[i].x + nx, pts[i].y, pts[i].z + nz, pts[i].x - nx, pts[i].y, pts[i].z - nz);
        if (i < pts.length - 1) idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xd9c79a, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.renderOrder = 1;
    this.group.add(mesh);
  }
}
