// 攻城戦の城の3D表示。城壁・城門・門楼・角楼・城内の建物を建て、壊れた区画は崩れた姿に変える。
// 建物は、戦略マップの都市と同じ部品(箱・屋根)をまとめて描く。
import * as THREE from "three";
import { createPartGroups, type Part } from "../world/parts/instancing";
import type { FieldMap } from "./fieldData";
import type { Siege, SiegeSegment } from "./siege";

const WALL_HURT = new THREE.Color("#5f4f3c");
const RUBBLE = new THREE.Color("#6b5d49");

/**
 * 城郭の様式(Version 42)。すべての都市に同じ様式を当てはめない。
 * - central:中原の版築の城壁、朱塗りの門楼、灰色の瓦屋根
 * - frontier:北辺の城(長城沿い・遼西など)。土色の濃い版築、木地の門楼、瓦は少なめ
 * - oasis:西域のオアシス都市。日干し煉瓦の明るい壁、平らな屋根(瓦屋根なし)
 * - south:江南の城。明るい漆喰の民家、黒い瓦
 * 首都は、門楼と中心部の殿舎の瓦を金色にする。
 */
export type CastleStyle = "central" | "frontier" | "oasis" | "south";
interface Palette { wall: string; gate: string; tower: string; timber: string; roof: string; flatRoof: boolean; houses: string[]; houseRoofs: string[]; street: string; palaceRoof: string }
const PALETTES: Record<CastleStyle, Palette> = {
  central: { wall: "#8f7a57", gate: "#7a6748", tower: "#7d6b4d", timber: "#8c3b2a", roof: "#3b3f43", flatRoof: false, houses: ["#d6ccb4", "#c9bd9f", "#b9a47c", "#a98f68"], houseRoofs: ["#5c5f63", "#8d7c52"], street: "#b9a983", palaceRoof: "#3b3f43" },
  frontier: { wall: "#7c6a4c", gate: "#6d5c40", tower: "#6f5f45", timber: "#6f4a33", roof: "#4a4640", flatRoof: false, houses: ["#b9a37c", "#a98f68", "#9c8664"], houseRoofs: ["#8d7c52", "#6b6558"], street: "#a8966f", palaceRoof: "#4a4640" },
  oasis: { wall: "#c2a676", gate: "#b0905f", tower: "#b89a68", timber: "#9c7a4e", roof: "#a88b5c", flatRoof: true, houses: ["#d8c39a", "#cdb487", "#e0cfa8"], houseRoofs: ["#bfa577"], street: "#d4c29a", palaceRoof: "#a88b5c" },
  south: { wall: "#86795f", gate: "#73654c", tower: "#7a6c52", timber: "#8c3b2a", roof: "#2f3236", flatRoof: false, houses: ["#e4ddcc", "#d8d0bc", "#cfc6b0"], houseRoofs: ["#3b3f43", "#45494d"], street: "#bfb08c", palaceRoof: "#2f3236" },
};

/** 都市の位置と性質から、様式を決める */
export function castleStyleOf(city: { lon: number; lat: number; oasis?: boolean } | undefined): CastleStyle {
  if (!city) return "central";
  if (city.oasis || city.lon < 100) return "oasis";
  if (city.lat >= 39.3) return "frontier";
  if (city.lat < 32.5) return "south";
  return "central";
}

export class SiegeModel {
  readonly group = new THREE.Group();
  private readonly walls = new Map<string, { mesh: THREE.Mesh; top: THREE.Object3D | null; down: boolean }>();

  private readonly pal: Palette;

  constructor(private readonly siege: Siege, field: FieldMap, flagColor: string, style: CastleStyle = "central", capital = false) {
    const pal = (this.pal = PALETTES[style]);
    const l = siege.layout;
    const roofOf = (base: string): string => (capital ? "#c99a35" : base);
    const ground = field.heightAt(l.cx, l.cz);
    const h = l.wallHeight;
    this.group.position.y = ground;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    // ----- 城壁と城門(1区画ずつ別の部品にして、壊れたときに姿を変えられるようにする) -----
    for (const s of l.segments) {
      const material = new THREE.MeshLambertMaterial({ color: s.kind === "gate" ? pal.gate : pal.wall });
      const mesh = new THREE.Mesh(box, material);
      mesh.position.set(s.x, 0, s.z);
      mesh.scale.set(s.w + (s.south ? 0 : 0.01), s.kind === "gate" ? h * 1.12 : h, s.d * (s.kind === "gate" ? 1.3 : 1));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      // 城門の上の門楼と、暗い門道
      let top: THREE.Object3D | null = null;
      if (s.kind === "gate") {
        top = new THREE.Group();
        const parts: Part[] = [
          { shape: "box", surface: "body", tier: 0, x: 0, y: h * 1.12, z: 0, sx: s.w * 1.15, sy: h * 0.45, sz: s.d * 1.1, rot: 0, color: pal.timber },
          { shape: pal.flatRoof ? "box" : "hip", surface: "tile", tier: 0, x: 0, y: h * 1.5, z: 0, sx: s.w * 1.6, sy: h * (pal.flatRoof ? 0.08 : 0.22), sz: s.d * 1.9, rot: 0, color: roofOf(pal.roof) },
          { shape: "box", surface: "body", tier: 0, x: 0, y: h * 1.6, z: 0, sx: s.w * 0.9, sy: h * 0.4, sz: s.d * 0.85, rot: 0, color: pal.timber },
          { shape: pal.flatRoof ? "box" : "hip", surface: "tile", tier: 0, x: 0, y: h * 2.0, z: 0, sx: s.w * 1.3, sy: h * (pal.flatRoof ? 0.1 : 0.4), sz: s.d * 1.5, rot: 0, color: roofOf(pal.roof) },
          { shape: "box", surface: "body", tier: 0, x: 0, y: 0, z: s.d * 0.62, sx: s.w * 0.45, sy: h * 0.7, sz: 0.4, rot: 0, color: "#241c18" },
          { shape: "box", surface: "body", tier: 0, x: s.w * 0.5, y: h * 2.2, z: 0, sx: 0.25, sy: h * 0.8, sz: 0.25, rot: 0, color: "#32281f" },
          { shape: "box", surface: "body", tier: 0, x: s.w * 0.5 + 1.6, y: h * 2.65, z: 0, sx: 3, sy: 1.8, sz: 0.15, rot: 0, color: flagColor },
        ];
        top.add(createPartGroups(parts)[0]);
        top.position.set(s.x, 0, s.z);
        this.group.add(top);
      }
      this.walls.set(s.id, { mesh, top, down: false });
    }

    // ----- 動かない部品:胸壁、角楼、城内の建物、中心部の殿舎 -----
    const parts: Part[] = [];
    const add = (shape: Part["shape"], x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, rot = 0): void => {
      parts.push({ shape, surface: shape === "box" || shape === "wall" ? "body" : "tile", tier: 0, x, y, z, sx, sy, sz, rot, color });
    };
    const hw = l.w / 2;
    for (const [x, z] of [[-hw, l.southZ], [hw, l.southZ], [-hw, l.southZ - l.d], [hw, l.southZ - l.d]]) {
      add("box", x, 0, z, l.thick * 1.9, h * 1.2, l.thick * 1.9, pal.tower);
      add("box", x, h * 1.2, z, l.thick * 1.5, h * 0.4, l.thick * 1.5, pal.timber);
      if (pal.flatRoof) add("box", x, h * 1.6, z, l.thick * 1.8, h * 0.08, l.thick * 1.8, pal.roof);
      else add("pyramid", x, h * 1.6, z, l.thick * 2.2, h * 0.45, l.thick * 2.2, pal.roof);
    }
    // 城内:大通り(城門から中心部へ)と、通りに沿って並ぶ民家
    const gates = l.segments.filter((s) => s.kind === "gate");
    for (const g of gates) add("box", g.x, 0.02, l.cz, 5, 0.05, l.d - l.thick, pal.street);
    add("box", 0, 0.02, l.cz, l.w - l.thick, 0.05, 5, pal.street);
    const walls = pal.houses;
    let seed = 7;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let z = l.southZ - 12; z > l.southZ - l.d + 8; z -= 7) {
      for (let x = -hw + 8; x < hw - 8; x += 6.5) {
        if (rand() > 0.7) continue;
        if (gates.some((g) => Math.abs(x - g.x) < 5.5) || Math.abs(z - l.cz) < 5.5) continue; // 大通りの上には建てない
        if (Math.hypot(x - l.keep.x, z - l.keep.z) < l.keep.r + 6) continue; // 中心部は別に建てる
        const w = 3.6 + rand() * 1.6;
        add("box", x, 0, z, w, 1.9, 2.8, walls[Math.floor(rand() * walls.length)]);
        const hr = pal.houseRoofs[rand() < 0.2 ? pal.houseRoofs.length - 1 : 0];
        if (pal.flatRoof) add("box", x, 1.9, z, w * 1.05, 0.25, 3.0, hr); // 西域の平屋根
        else add("hip", x, 1.9, z, w * 1.3, 1.4, 4.0, hr);
      }
    }
    // 中心部:内城の塀と、基壇の上の殿舎
    const k = l.keep;
    if (l.hasInner) {
      for (const [x, z, sx, sz] of [[k.x, k.z - k.r, k.r * 2, 1.2], [k.x - k.r, k.z, 1.2, k.r * 2], [k.x + k.r, k.z, 1.2, k.r * 2], [k.x - k.r * 0.62, k.z + k.r, k.r * 0.75, 1.2], [k.x + k.r * 0.62, k.z + k.r, k.r * 0.75, 1.2]]) {
        add("box", x, 0, z, sx, h * 0.5, sz, "#9a5140");
      }
    }
    add("box", k.x, 0, k.z - k.r * 0.3, k.r * 1.1, 0.9, k.r * 0.75, "#bdb7a9");
    add("box", k.x, 0.9, k.z - k.r * 0.3, k.r * 0.85, 3.2, k.r * 0.5, pal.timber);
    if (pal.flatRoof) add("box", k.x, 4.1, k.z - k.r * 0.3, k.r * 0.95, 0.4, k.r * 0.6, roofOf(pal.palaceRoof));
    else add("hip", k.x, 4.1, k.z - k.r * 0.3, k.r * 1.2, 2.6, k.r * 0.85, roofOf(pal.palaceRoof));
    const fixed = createPartGroups(parts)[0];
    fixed.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.add(fixed);
  }

  /** 損傷に合わせて、城壁の色を変える。壊れた区画は、崩れた土の山にする */
  update(): void {
    for (const s of this.siege.layout.segments) {
      const w = this.walls.get(s.id)!;
      if (w.down) continue;
      const material = w.mesh.material as THREE.MeshLambertMaterial;
      if (s.hp <= 0) {
        w.down = true;
        w.mesh.scale.y = s.kind === "gate" ? 0.25 : this.siege.layout.wallHeight * 0.16;
        w.mesh.scale.z *= 1.6;
        material.color.copy(RUBBLE);
        if (w.top) w.top.visible = false;
      } else if (s.south) {
        material.color.copy(new THREE.Color(s.kind === "gate" ? this.pal.gate : this.pal.wall)).lerp(WALL_HURT, 1 - s.hp / s.maxHp);
      }
    }
  }

  /** いちばん傷んでいない南面の区画(動作確認用) */
  segmentInfo(): SiegeSegment[] {
    return this.siege.layout.segments.filter((s) => s.south);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    });
  }
}
