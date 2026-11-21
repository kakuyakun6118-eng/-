// 3Dの後宮(皇帝生活モード)の建物・庭園・回廊。
// 建築は、魏晋(4世紀)の宮殿の推定復元:基壇の上の木造の殿舎、朱塗りの柱、白い壁、灰色の瓦の寄棟屋根と、
// 棟の両端の鴟尾。唐代のような強い反りはなく、軒はゆるやか。細部(斗栱・窓の格子・調度)は史料が乏しく、ゲームのための推定。
// 長さの単位はメートル。x が東、z が南(北が奥)。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Area } from "../sim/palace";

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface PalaceWorld {
  group: THREE.Group;
  /** 通れない所(壁・柱・池など) */
  obstacles: Rect[];
  /** 屋根(中に入ると消す) */
  roofs: { mesh: THREE.Object3D; rect: Rect }[];
  /** その地点がどの区画か */
  areaAt(x: number, z: number): Area;
  /** 区画ごとの、人の立つ所 */
  spots: Record<Area, { x: number; z: number }[]>;
  /** 区画の入口(人の行き来の道しるべ) */
  doors: Record<Area, { x: number; z: number }>;
  /** 夜に灯る灯火 */
  lamps: THREE.Mesh[];
  bounds: Rect;
  /** 地面の高さ(基壇の上は高い) */
  floorAt(x: number, z: number): number;
}

const M = {
  stone: new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }),
  paving: new THREE.MeshLambertMaterial({ color: 0x9c968a }),
  grass: new THREE.MeshLambertMaterial({ color: 0x5f7a45 }),
  pillar: new THREE.MeshLambertMaterial({ color: 0x8e2a1e }),
  wall: new THREE.MeshLambertMaterial({ color: 0xe8e0cc }),
  frame: new THREE.MeshLambertMaterial({ color: 0x6e2418 }),
  roof: new THREE.MeshLambertMaterial({ color: 0x4a4d52, flatShading: true, side: THREE.DoubleSide }),
  ridge: new THREE.MeshLambertMaterial({ color: 0x33363a }),
  wood: new THREE.MeshLambertMaterial({ color: 0x6b4a2e }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2a1c14 }),
  water: new THREE.MeshLambertMaterial({ color: 0x3f6a78, transparent: true, opacity: 0.85 }),
  bath: new THREE.MeshLambertMaterial({ color: 0x6a9aa8, transparent: true, opacity: 0.8 }),
  rock: new THREE.MeshLambertMaterial({ color: 0x7a7468, flatShading: true }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x4e3a28 }),
  willow: new THREE.MeshLambertMaterial({ color: 0x7c9a4a }),
  pine: new THREE.MeshLambertMaterial({ color: 0x35553a }),
  plum: new THREE.MeshLambertMaterial({ color: 0xe2a6b8 }),
  silk: new THREE.MeshLambertMaterial({ color: 0xc9a46a }),
  curtain: new THREE.MeshLambertMaterial({ color: 0xa04050, side: THREE.DoubleSide }),
  screen: new THREE.MeshLambertMaterial({ color: 0xd8c8a0 }),
  bronze: new THREE.MeshLambertMaterial({ color: 0x7a6038 }),
  lamp: new THREE.MeshLambertMaterial({ color: 0xf0d080, emissive: 0x000000 }),
};

/** 寄棟屋根(四方に流れる屋根)。軒の四隅をわずかに上げる */
function hipRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2, lift = 0.35;
  const r = Math.max(0, hw - hd * 0.9);
  const v = [
    -hw, lift, -hd, hw, lift, -hd, hw, lift, hd, -hw, lift, hd, // 軒の四隅 0-3
    -r, h, 0, r, h, 0, // 棟 4,5
    0, 0, -hd * 0.98, 0, 0, hd * 0.98, -hw * 0.98, 0, 0, hw * 0.98, 0, 0, // 軒の中ほど(少し低い:ゆるい反り) 6-9
  ];
  const idx = [
    // 南の面(z+):3,7,2 と 5,4
    3, 7, 4, 7, 2, 5, 7, 5, 4,
    // 北の面
    1, 6, 5, 6, 0, 4, 6, 4, 5,
    // 東の面
    2, 9, 5, 9, 1, 5,
    // 西の面
    0, 8, 4, 8, 3, 4,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildPalace(): PalaceWorld {
  const group = new THREE.Group();
  const obstacles: Rect[] = [];
  const roofs: PalaceWorld["roofs"] = [];
  const lamps: THREE.Mesh[] = [];
  const platforms: { rect: Rect; h: number }[] = [];
  const bounds: Rect = { x0: -70, z0: -92, x1: 70, z1: 90 };
  const add = (m: THREE.Object3D): THREE.Object3D => {
    group.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, cast = false): THREE.Mesh => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    add(m);
    return m;
  };
  const block = (x0: number, z0: number, x1: number, z1: number): void => {
    obstacles.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  };

  // 地面:石畳と、庭園の芝
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(bounds.x1 - bounds.x0 + 40, bounds.z1 - bounds.z0 + 40), M.paving);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  add(ground);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(58, 74), M.grass);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(0, 0.02, 40);
  lawn.receiveShadow = true;
  add(lawn);

  // 外の壁(宮城の塀)
  const wallH = 4.5;
  for (const [x0, z0, x1, z1] of [[bounds.x0, bounds.z0, bounds.x1, bounds.z0 + 1], [bounds.x0, bounds.z1 - 1, bounds.x1, bounds.z1], [bounds.x0, bounds.z0, bounds.x0 + 1, bounds.z1], [bounds.x1 - 1, bounds.z0, bounds.x1, bounds.z1]]) {
    box(x1 - x0, wallH, z1 - z0, M.wall, (x0 + x1) / 2, wallH / 2, (z0 + z1) / 2);
    box(x1 - x0 + 0.6, 0.5, z1 - z0 + 0.6, M.roof, (x0 + x1) / 2, wallH + 0.2, (z0 + z1) / 2);
    block(x0, z0, x1, z1);
  }

  /**
   * 殿舎:基壇・柱・壁(背と両側。正面は開く)・寄棟屋根・鴟尾。facing は正面の向き("s" 南 / "e" 東 / "w" 西)
   */
  const hall = (cx: number, cz: number, w: number, d: number, facing: "s" | "e" | "w", base = 1.0, height = 5.2): Rect => {
    const rot = facing === "s" ? 0 : facing === "e" ? Math.PI / 2 : -Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rot;
    // 向きに合わせた広さ(ローカルでは、w が正面の幅、d が奥行き。正面は +z)
    const plat = new THREE.Mesh(new THREE.BoxGeometry(w + 3, base, d + 3), M.stone);
    plat.position.y = base / 2;
    plat.receiveShadow = true;
    g.add(plat);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), M.wood);
    floor.position.y = base + 0.04;
    g.add(floor);
    // 柱:正面と両側
    const cols = Math.max(3, Math.round(w / 4));
    const pg = new THREE.CylinderGeometry(0.22, 0.25, height, 8);
    for (let i = 0; i <= cols; i++) {
      const x = -w / 2 + (w * i) / cols;
      for (const z of [d / 2, -d / 2]) {
        const p = new THREE.Mesh(pg, M.pillar);
        p.position.set(x, base + height / 2, z);
        p.castShadow = true;
        g.add(p);
      }
    }
    // 壁:背と両側(朱の枠)
    const wallMesh = (ww: number, x: number, z: number, ry: number): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, height - 0.6, 0.25), M.wall);
      m.position.set(x, base + (height - 0.6) / 2, z);
      m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
      const top = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.35, 0.32), M.frame);
      top.position.set(x, base + height - 0.6, z);
      top.rotation.y = ry;
      g.add(top);
    };
    wallMesh(w, 0, -d / 2, 0);
    wallMesh(d, -w / 2, 0, Math.PI / 2);
    wallMesh(d, w / 2, 0, Math.PI / 2);
    // 梁と屋根
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), M.frame);
    beam.position.y = base + height + 0.2;
    g.add(beam);
    const roof = new THREE.Group();
    const rm = new THREE.Mesh(hipRoof(w + 4, d + 4, Math.min(w, d) * 0.42 + 1.2), M.roof);
    rm.castShadow = true;
    roof.add(rm);
    // 棟と鴟尾
    const rr = Math.max(0, (w + 4) / 2 - ((d + 4) / 2) * 0.9);
    const ridgeH = Math.min(w, d) * 0.42 + 1.2;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(rr * 2 + 0.6, 0.5, 0.5), M.ridge);
    ridge.position.y = ridgeH + 0.2;
    roof.add(ridge);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 6, 10, Math.PI * 0.9), M.ridge);
      tail.position.set(s * (rr + 0.3), ridgeH + 0.7, 0);
      tail.rotation.set(0, s > 0 ? Math.PI : 0, Math.PI * 0.55);
      roof.add(tail);
    }
    roof.position.y = base + height + 0.45;
    g.add(roof);
    add(g);
    // 通れない所(世界の座標で):背の壁・両側の壁。基壇は上れる(正面から入れる)
    const toWorld = (x: number, z: number): { x: number; z: number } => ({ x: cx + x * Math.cos(rot) + z * Math.sin(rot), z: cz - x * Math.sin(rot) + z * Math.cos(rot) });
    const seg = (ax: number, az: number, bx: number, bz: number): void => {
      const a = toWorld(ax, az), b = toWorld(bx, bz);
      block(Math.min(a.x, b.x) - 0.3, Math.min(a.z, b.z) - 0.3, Math.max(a.x, b.x) + 0.3, Math.max(a.z, b.z) + 0.3);
    };
    seg(-w / 2, -d / 2, w / 2, -d / 2);
    seg(-w / 2, -d / 2, -w / 2, d / 2);
    seg(w / 2, -d / 2, w / 2, d / 2);
    const c0 = toWorld(-(w + 3) / 2, -(d + 3) / 2), c1 = toWorld((w + 3) / 2, (d + 3) / 2);
    const pr: Rect = { x0: Math.min(c0.x, c1.x), z0: Math.min(c0.z, c1.z), x1: Math.max(c0.x, c1.x), z1: Math.max(c0.z, c1.z) };
    platforms.push({ rect: pr, h: base });
    const i0 = toWorld(-w / 2, -d / 2), i1 = toWorld(w / 2, d / 2);
    roofs.push({ mesh: roof, rect: { x0: Math.min(i0.x, i1.x), z0: Math.min(i0.z, i1.z), x1: Math.max(i0.x, i1.x), z1: Math.max(i0.z, i1.z) } });
    return pr;
  };

  // 調度(中の飾り)
  const dais = (x: number, z: number, w: number, d: number, y: number): void => {
    box(w, 0.4, d, M.dark, x, y + 0.2, z);
    box(w * 0.9, 1.8, 0.12, M.screen, x, y + 1.3, z - d / 2 + 0.1); // 屏風
  };
  const table = (x: number, z: number, y: number): void => {
    box(1.4, 0.35, 0.7, M.wood, x, y + 0.35, z);
    box(0.9, 0.08, 0.9, M.silk, x, y + 0.04, z + 0.9);
  };
  const lampAt = (x: number, z: number, y = 0): void => {
    box(0.12, 1.6, 0.12, M.bronze, x, y + 0.8, z);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.lamp.clone());
    l.position.set(x, y + 1.75, z);
    add(l);
    lamps.push(l);
  };

  // 1. 皇帝の寝殿(北の中央)
  hall(0, -72, 30, 14, "s", 1.6, 6);
  dais(0, -76, 8, 3, 1.6);
  table(0, -71, 1.6);
  for (const x of [-12, 12]) lampAt(x, -62);
  // 2. 皇后の宮殿
  hall(0, -40, 24, 12, "s", 1.2, 5.4);
  dais(0, -43, 6, 2.5, 1.2);
  for (const x of [-9, 9]) lampAt(x, -32);
  // 3. 妃たちの居所(東の列)
  for (const z of [-52, -28, -4]) {
    hall(50, z, 16, 10, "w", 0.9, 4.6);
    // 帳(とばり)と寝台の台
    box(4, 0.5, 2.2, M.dark, 53, 0.9 + 0.25, z);
    const cur = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.6), M.curtain);
    cur.position.set(51.5, 0.9 + 1.6, z);
    cur.rotation.y = Math.PI / 2;
    add(cur);
    lampAt(40, z + 6);
  }
  // 4. 女官の詰所(西)
  hall(-50, -30, 34, 11, "e", 0.8, 4.4);
  for (const z of [-42, -34, -26, -18]) box(0.6, 2, 3, M.wood, -54, 0.8 + 1, z); // 棚
  box(2, 1, 1.4, M.wood, -50, 0.8 + 0.5, -30); // 機(はた)
  lampAt(-40, -14);
  // 5. 浴殿(北西)
  hall(-50, -74, 18, 12, "e", 0.6, 4.2);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 5), M.bath);
  pool.position.set(-51, 0.65, -74);
  add(pool);
  box(7.6, 0.5, 0.4, M.stone, -51, 0.85, -76.7);
  box(7.6, 0.5, 0.4, M.stone, -51, 0.85, -71.3);
  block(-54.8, -76.9, -47.2, -71.1);
  lampAt(-40, -66);
  // 6. 宴会場(南西)
  hall(-48, 44, 22, 20, "e", 1.0, 5.6);
  for (let i = 0; i < 4; i++) for (const zz of [38, 50]) table(-52 + i * 3, zz, 1.0);
  dais(-56, 44, 4, 6, 1.0);
  lampAt(-34, 34);
  lampAt(-34, 54);

  // 7. 回廊:中軸(南門から寝殿まで)と、東西の回廊。屋根つきの柱の列
  const corridor = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    const g = new THREE.Group();
    g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    g.rotation.y = ang;
    const n = Math.max(2, Math.round(len / 4));
    const pg = new THREE.CylinderGeometry(0.16, 0.18, 3.2, 6);
    for (let i = 0; i <= n; i++) for (const sx of [-2, 2]) {
      const p = new THREE.Mesh(pg, M.pillar);
      p.position.set(sx, 1.6, -len / 2 + (len * i) / n);
      g.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, len + 0.6), M.roof);
    top.position.y = 3.35;
    top.castShadow = true;
    g.add(top);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, len + 0.6), M.ridge);
    ridge.position.y = 3.6;
    g.add(ridge);
    add(g);
    // 回廊の屋根も、下に入ると消す(カメラの視界をふさがないように)
    const roofOnly = new THREE.Group();
    g.remove(top, ridge);
    roofOnly.add(top, ridge);
    g.add(roofOnly);
    roofs.push({ mesh: roofOnly, rect: { x0: Math.min(x0, x1) - 3, z0: Math.min(z0, z1) - 3, x1: Math.max(x0, x1) + 3, z1: Math.max(z0, z1) + 3 } });
  };
  corridor(0, 84, 0, 12);
  corridor(0, -4, 0, -30);
  corridor(-30, -12, 30, -12);
  corridor(-32, -12, -40, -12);
  corridor(32, -12, 40, -12);
  for (const z of [70, 50, 20, -8, -20]) lampAt(3.2, z);

  // 南門
  box(14, 6, 3, M.wall, -9.5, 3, 89);
  box(14, 6, 3, M.wall, 9.5, 3, 89);
  const gateRoof = new THREE.Mesh(hipRoof(36, 6, 2.4), M.roof);
  gateRoof.position.set(0, 6.2, 89);
  add(gateRoof);

  // 8. 後宮の庭園:池・橋・亭・岩・柳・松・梅
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 36), M.water);
  pond.scale.set(14, 9, 1);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(-10, 0.05, 40);
  add(pond);
  // 池は通れない(楕円をいくつかの四角で近づける。橋の所はあける)
  for (let i = -6; i <= 6; i++) {
    const t = i / 6.5;
    const hz = 9 * Math.sqrt(Math.max(0, 1 - t * t));
    const x = -10 + t * 14;
    // 橋(南北にかかる。x = -10 のあたり)の所は通れる
    if (Math.abs(x - -10) >= 1.4) block(x - 1.2, 40 - hz, x + 1.2, 40 + hz);
  }
  // 橋(南北にかかる、ゆるい太鼓橋)
  for (let i = 0; i < 10; i++) {
    const z = 30 + i * 2;
    const y = 0.15 + Math.sin((i / 9) * Math.PI) * 0.9;
    box(2.6, 0.2, 2.1, M.wood, -10, y, z);
  }
  // 亭(あずまや)
  {
    const g = new THREE.Group();
    g.position.set(14, 0, 30);
    const pg = new THREE.CylinderGeometry(0.15, 0.17, 3, 6);
    for (const [x, z] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) {
      const p = new THREE.Mesh(pg, M.pillar);
      p.position.set(x, 1.5 + 0.3, z);
      g.add(p);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 8), M.stone);
    base.position.y = 0.15;
    g.add(base);
    const r = new THREE.Mesh(new THREE.ConeGeometry(4, 2.2, 4), M.roof);
    r.position.y = 4.2;
    r.rotation.y = Math.PI / 4;
    r.castShadow = true;
    g.add(r);
    add(g);
  }
  const rock = (x: number, z: number, s: number): void => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), M.rock);
    m.position.set(x, s * 0.6, z);
    m.scale.y = 1.4;
    m.castShadow = true;
    add(m);
    block(x - s * 0.8, z - s * 0.8, x + s * 0.8, z + s * 0.8);
  };
  rock(-22, 30, 1.6);
  rock(4, 52, 1.2);
  rock(20, 60, 2);
  rock(-24, 56, 1.3);
  const tree = (x: number, z: number, kind: "willow" | "pine" | "plum"): void => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, kind === "pine" ? 5 : 3.2, 6), M.trunk);
    t.position.y = kind === "pine" ? 2.5 : 1.6;
    g.add(t);
    if (kind === "willow") {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.2, 8, 1, true), M.willow);
      c.position.y = 3.2;
      c.rotation.x = Math.PI;
      g.add(c);
    } else if (kind === "pine") {
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * 0.5, 1.8, 7), M.pine);
        c.position.y = 3.4 + i * 1.2;
        g.add(c);
      }
    } else {
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 0), M.plum);
      c.position.y = 3.6;
      g.add(c);
    }
    g.traverse((o) => (o.castShadow = true));
    add(g);
    block(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  };
  for (const [x, z] of [[-24, 36], [3, 32], [-18, 50], [2, 46]]) tree(x, z, "willow");
  for (const [x, z] of [[24, 12], [-26, 14], [24, 70], [-20, 72]]) tree(x, z, "pine");
  for (const [x, z] of [[18, 44], [22, 50], [12, 64], [26, 38]]) tree(x, z, "plum");
  // 寝殿の前の庭木
  for (const x of [-18, 18]) tree(x, -58, "pine");

  const inR = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const zones: [Area, Rect][] = [
    // 回廊(中軸と東西)を先に見る(庭園・寝殿と重なる所は回廊とする)
    ["corridor", { x0: -3, z0: 12, x1: 3, z1: 84 }],
    ["corridor", { x0: -3, z0: -30, x1: 3, z1: -4 }],
    ["corridor", { x0: -40, z0: -15, x1: 40, z1: -9 }],
    ["emperorHall", { x0: -20, z0: -86, x1: 20, z1: -56 }],
    ["empressPalace", { x0: -18, z0: -52, x1: 18, z1: -30 }],
    ["consortQuarters", { x0: 34, z0: -64, x1: 68, z1: 8 }],
    ["ladiesStation", { x0: -68, z0: -52, x1: -36, z1: -8 }],
    ["bath", { x0: -68, z0: -90, x1: -36, z1: -60 }],
    ["banquet", { x0: -68, z0: 26, x1: -34, z1: 70 }],
    ["garden", { x0: -30, z0: 4, x1: 30, z1: 80 }],
  ];
  const areaAt = (x: number, z: number): Area => (zones.find(([, r]) => inR(r, x, z))?.[0] ?? "corridor");
  const spots: Record<Area, { x: number; z: number }[]> = {
    emperorHall: [{ x: -6, z: -66 }, { x: 6, z: -66 }, { x: 0, z: -60 }, { x: -10, z: -58 }],
    empressPalace: [{ x: -5, z: -36 }, { x: 5, z: -36 }, { x: 0, z: -32 }, { x: -12, z: -31 }],
    consortQuarters: [{ x: 44, z: -52 }, { x: 44, z: -28 }, { x: 44, z: -4 }, { x: 38, z: -16 }, { x: 38, z: -40 }],
    ladiesStation: [{ x: -46, z: -40 }, { x: -46, z: -30 }, { x: -46, z: -20 }, { x: -40, z: -26 }],
    bath: [{ x: -46, z: -78 }, { x: -46, z: -70 }, { x: -40, z: -74 }],
    banquet: [{ x: -44, z: 38 }, { x: -44, z: 50 }, { x: -50, z: 44 }, { x: -36, z: 44 }],
    garden: [{ x: 10, z: 26 }, { x: 14, z: 34 }, { x: -10, z: 20 }, { x: -10, z: 58 }, { x: 16, z: 56 }, { x: -4, z: 66 }, { x: 22, z: 20 }],
    corridor: [{ x: -2.4, z: 60 }, { x: 2.4, z: 30 }, { x: -20, z: -10 }, { x: 20, z: -14 }, { x: 2.4, z: -20 }],
  };
  const doors: Record<Area, { x: number; z: number }> = {
    emperorHall: { x: 0, z: -58 }, empressPalace: { x: 0, z: -30 }, consortQuarters: { x: 36, z: -12 }, ladiesStation: { x: -38, z: -12 },
    bath: { x: -38, z: -70 }, banquet: { x: -34, z: 44 }, garden: { x: 0, z: 10 }, corridor: { x: 0, z: -12 },
  };
  const floorAt = (x: number, z: number): number => {
    let h = 0;
    for (const p of platforms) if (inR(p.rect, x, z)) h = Math.max(h, p.h);
    return h;
  };
  mergeStatic(group, new Set([...roofs.map((r) => r.mesh), ...lamps]));
  return { group, obstacles, roofs, areaAt, spots, doors, lamps, bounds, floorAt };
}

/**
 * 動かない飾り(屋根の切り替え・灯火を除く)を、材質ごとに1つの形にまとめる(描く回数を減らし、iPhone でも軽くする)
 */
function mergeStatic(group: THREE.Group, keep: Set<THREE.Object3D>): void {
  group.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const shadow = new Map<THREE.Material, boolean>();
  const drop: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) if (keep.has(p)) return;
    const mat = m.material as THREE.Material;
    let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count) * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
    shadow.set(mat, (shadow.get(mat) ?? false) || m.castShadow);
    drop.push(m);
  });
  for (const m of drop) m.parent?.remove(m);
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow.get(mat) ?? false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

/** 人の姿(低い多角形)。魏晋の服:裾の広い衣、大きな袖、帯、結い上げた髪と簪。皇帝は黒と朱の衣に冠 */
export function buildFigure(looks: { robe: string; trim: string; hair: number; height: number }, emperor = false): THREE.Group {
  const g = new THREE.Group();
  const robe = new THREE.MeshLambertMaterial({ color: new THREE.Color(looks.robe) });
  const trim = new THREE.MeshLambertMaterial({ color: new THREE.Color(looks.trim) });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe9c9a8 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1412 });
  const H = looks.height;
  const k = H / 1.6;
  // 裾の広い衣(回転体)
  const prof = [new THREE.Vector2(0.01, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.36, 0.3), new THREE.Vector2(0.26, 0.75), new THREE.Vector2(0.2, 1.0), new THREE.Vector2(0.17, 1.25), new THREE.Vector2(0.01, 1.32)];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 10), robe);
  body.scale.set(k, k, k);
  body.castShadow = true;
  g.add(body);
  // 帯
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.21 * k, 0.22 * k, 0.1 * k, 10), trim);
  belt.position.y = 0.95 * k;
  g.add(belt);
  // 衿
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14 * k, 0.035 * k, 4, 10), trim);
  collar.position.y = 1.28 * k;
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  // 大きな袖
  for (const s of [-1, 1]) {
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * k, 0.2 * k, 0.6 * k, 8), robe);
    sl.position.set(s * 0.27 * k, 0.98 * k, 0.05 * k);
    sl.rotation.z = s * 0.35;
    sl.name = s < 0 ? "sleeveL" : "sleeveR";
    g.add(sl);
  }
  // 頭
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * k, 10, 8), skin);
  head.position.y = 1.45 * k;
  g.add(head);
  if (emperor) {
    // 冠(通天冠の推定:高い前立てのある冠)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16 * k, 0.2 * k, 0.24 * k), new THREE.MeshLambertMaterial({ color: 0x141414 }));
    cap.position.set(0, 1.62 * k, -0.02 * k);
    g.add(cap);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * k, 0.01 * k, 0.4 * k, 4), trim);
    pin.position.y = 1.64 * k;
    pin.rotation.z = Math.PI / 2;
    g.add(pin);
  } else {
    // 結い上げた髪(4つの形)と簪
    const bun = (x: number, y: number, z: number, r: number): void => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(r * k, 8, 6), hair);
      b.position.set(x * k, y * k, z * k);
      g.add(b);
    };
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.135 * k, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
    back.position.y = 1.47 * k;
    g.add(back);
    if (looks.hair === 0) bun(0, 1.66, -0.02, 0.08);
    else if (looks.hair === 1) { bun(-0.08, 1.62, 0, 0.065); bun(0.08, 1.62, 0, 0.065); }
    else if (looks.hair === 2) { bun(0, 1.7, -0.03, 0.06); bun(0, 1.6, -0.08, 0.075); }
    else bun(0, 1.6, -0.12, 0.085);
    const kz = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * k, 0.008 * k, 0.28 * k, 4), trim);
    kz.position.set(0.04 * k, 1.66 * k, -0.02 * k);
    kz.rotation.z = 1.2;
    g.add(kz);
  }
  // 動かない部品(袖を除く)を材質ごとにまとめる(描く回数を減らす)
  const sleeves = g.children.filter((o) => o.name === "sleeveL" || o.name === "sleeveR");
  mergeStatic(g, new Set(sleeves));
  return g;
}
