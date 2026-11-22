// 3Dの後宮(皇帝生活モード)の建物・調度・庭園・回廊(Version 53 で作り直し)。
// 建築は、魏晋(4世紀)の宮殿の推定復元:石の基壇と階段・欄干、朱塗りの柱と斗栱(柱の上の組物)、白い壁と格子の窓、
// 瓦の筋の見える寄棟屋根(軒はゆるやかに反る。唐代のような強い反りはつけない)、棟の両端の鴟尾と隅棟。
// 調度・庭園・浴殿の細部は、史料が乏しく、ゲームのための推定(史実と断定しない)。長さはメートル。x が東、z が南(北が奥)。
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Area } from "../sim/palace";
import type { Pose } from "./Figure";

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Seat { x: number; z: number; face: number; pose: Pose }

export interface PalaceWorld {
  group: THREE.Group;
  obstacles: Rect[];
  roofs: { mesh: THREE.Object3D; rect: Rect }[];
  areaAt(x: number, z: number): Area;
  spots: Record<Area, { x: number; z: number }[]>;
  /** 区画ごとの、座る・読む・弾く・食べる所(人物の日々の行動) */
  seats: Record<Area, Seat[]>;
  doors: Record<Area, { x: number; z: number }>;
  lamps: THREE.Mesh[];
  bounds: Rect;
  floorAt(x: number, z: number): number;
  /** 室内の調度(遠いときは隠す) */
  interiors: { group: THREE.Object3D; x: number; z: number }[];
  /** 季節の景色に変える(月) */
  setSeason(month: number): void;
  /** 空の色(上と地平) */
  setSky(top: number, horizon: number): void;
  /** 毎フレーム(湯気など) */
  tick(dt: number, t: number): void;
  readonly season: "spring" | "summer" | "autumn" | "winter";
}

type Quality = "low" | "mid" | "high";

// ---------- 絵(その場で描く。ファイルは使わない) ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function textures(): Record<string, THREE.CanvasTexture> {
  return {
    // 瓦:丸瓦の筋(縦)と、瓦の重なり(横)
    tile: canvasTex(64, 64, (g) => {
      g.fillStyle = "#4b4f55";
      g.fillRect(0, 0, 64, 64);
      for (let x = 0; x < 64; x += 8) {
        const gr = g.createLinearGradient(x, 0, x + 8, 0);
        gr.addColorStop(0, "#3a3d42"); gr.addColorStop(0.5, "#5e636a"); gr.addColorStop(1, "#3a3d42");
        g.fillStyle = gr;
        g.fillRect(x + 1, 0, 6, 64);
      }
      g.fillStyle = "rgba(0,0,0,0.25)";
      for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 2);
    }),
    // 石畳
    paving: canvasTex(128, 128, (g) => {
      g.fillStyle = "#9d978b";
      g.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) {
        const v = 140 + ((x * 7 + y * 13) % 30);
        g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
        g.fillRect(x + 1 + ((y / 32) % 2) * 16, y + 1, 30, 30);
      }
      g.strokeStyle = "rgba(60,55,48,0.5)";
      for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    }, [50, 60]),
    // 板の床
    wood: canvasTex(64, 64, (g) => {
      for (let y = 0; y < 64; y += 8) {
        g.fillStyle = y % 16 ? "#6b4a2e" : "#5e4128";
        g.fillRect(0, y, 64, 8);
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(0, y, 64, 1);
      }
    }, [4, 4]),
    // 格子の窓(透け)
    lattice: canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.strokeStyle = "#7a2a1e";
      g.lineWidth = 4;
      for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
    }, [2, 1]),
    // 屏風の絵(山水の推定)
    screen: canvasTex(128, 64, (g) => {
      g.fillStyle = "#e2d6b8";
      g.fillRect(0, 0, 128, 64);
      g.fillStyle = "#7d8f86";
      g.beginPath(); g.moveTo(0, 50); g.lineTo(25, 18); g.lineTo(45, 40); g.lineTo(70, 12); g.lineTo(100, 44); g.lineTo(128, 26); g.lineTo(128, 64); g.lineTo(0, 64); g.fill();
      g.fillStyle = "#566a63";
      g.beginPath(); g.moveTo(0, 60); g.lineTo(35, 36); g.lineTo(62, 58); g.lineTo(96, 34); g.lineTo(128, 60); g.lineTo(128, 64); g.lineTo(0, 64); g.fill();
      g.strokeStyle = "#7a2a1e"; g.lineWidth = 3; g.strokeRect(1, 1, 126, 62);
      for (let x = 32; x < 128; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
    }),
    steam: canvasTex(32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 32, 32);
    }),
  };
}

/** 反りのある寄棟屋根:4つの面を、軒から棟へ、なだらかな曲面(下が緩く上が急)で作る。瓦の筋が見えるよう UV を付ける */
function curvedRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const r = Math.max(0, hw - hd * 0.92);
  const lift = 0.45;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const face = (A: number[], B: number[], C: number[], D: number[]): void => {
    const rows = 6, cols = 8, base = pos.length / 3;
    const span = Math.hypot(B[0] - A[0], B[2] - A[2]);
    const slope = Math.hypot((C[0] + D[0]) / 2 - (A[0] + B[0]) / 2, h, (C[2] + D[2]) / 2 - (A[2] + B[2]) / 2);
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const ex = A[0] + (B[0] - A[0]) * u, ez = A[2] + (B[2] - A[2]) * u;
        const rx = C[0] + (D[0] - C[0]) * u, rz = C[2] + (D[2] - C[2]) * u;
        // 軒の四隅をわずかに上げる(ゆるやかな反り)
        const corner = (1 - Math.min(1, Math.min(u, 1 - u) * 5)) * (1 - t) * lift;
        const y = lift * 0.3 + (h - lift * 0.3) * Math.pow(t, 1.6) + corner;
        pos.push(ex + (rx - ex) * t, y, ez + (rz - ez) * t);
        uv.push((u * span) / 1.4, (t * slope) / 2);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, dd = c + 1;
      idx.push(a, b, c, b, dd, c);
    }
  };
  face([-hw, 0, hd], [hw, 0, hd], [-r, 0, 0], [r, 0, 0]);
  face([hw, 0, -hd], [-hw, 0, -hd], [r, 0, 0], [-r, 0, 0]);
  face([hw, 0, hd], [hw, 0, -hd], [r, 0, 0], [r, 0, 0]);
  face([-hw, 0, -hd], [-hw, 0, hd], [-r, 0, 0], [-r, 0, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildPalace(quality: Quality = "mid"): PalaceWorld {
  const low = quality === "low", high = quality === "high";
  const T = textures();
  // 低・中の画質では、模様の絵の拡大縮小を軽い方式(段階の間を混ぜない)にする。見た目はほぼ同じで、描く手間が減る
  if (!high) for (const t of Object.values(T)) if ((t as THREE.Texture).isTexture) (t as THREE.Texture).minFilter = THREE.LinearMipmapNearestFilter;
  const M = {
    stone: new THREE.MeshLambertMaterial({ color: 0xbcb4a4 }),
    paving: new THREE.MeshLambertMaterial({ map: T.paving }),
    grass: new THREE.MeshLambertMaterial({ color: 0x5f7a45 }),
    gravel: new THREE.MeshLambertMaterial({ color: 0xc8bfa8 }),
    pillar: new THREE.MeshLambertMaterial({ color: 0x9a2c1f }),
    wall: new THREE.MeshLambertMaterial({ color: 0xebe3cf }),
    frame: new THREE.MeshLambertMaterial({ color: 0x6e2418 }),
    bracket: new THREE.MeshLambertMaterial({ color: 0x3f6a5a }),
    roof: new THREE.MeshLambertMaterial({ map: T.tile, side: THREE.DoubleSide }),
    ridge: new THREE.MeshLambertMaterial({ color: 0x33363a }),
    wood: new THREE.MeshLambertMaterial({ map: T.wood }),
    lacquer: new THREE.MeshLambertMaterial({ color: 0x2a1410 }),
    redLacquer: new THREE.MeshLambertMaterial({ color: 0x7a1e16 }),
    lattice: new THREE.MeshLambertMaterial({ map: T.lattice, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
    paper: new THREE.MeshLambertMaterial({ color: 0xf0e6cc, transparent: true, opacity: 0.55 }),
    water: new THREE.MeshLambertMaterial({ color: 0x3f6a78, transparent: true, opacity: 0.82 }),
    bath: new THREE.MeshLambertMaterial({ color: 0x6a9aa8, transparent: true, opacity: 0.78 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x8a8476, flatShading: true }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x4e3a28 }),
    willow: new THREE.MeshLambertMaterial({ color: 0x86a64e, side: THREE.DoubleSide }),
    pine: new THREE.MeshLambertMaterial({ color: 0x33553a }),
    blossom: new THREE.MeshLambertMaterial({ color: 0xe8a8bc }),
    maple: new THREE.MeshLambertMaterial({ color: 0x6a9040 }),
    lotus: new THREE.MeshLambertMaterial({ color: 0x4a7a3a, side: THREE.DoubleSide }),
    snow: new THREE.MeshLambertMaterial({ color: 0xf2f4f6, transparent: true, opacity: 0 }),
    silk: new THREE.MeshLambertMaterial({ color: 0xc9a46a }),
    cushion: new THREE.MeshLambertMaterial({ color: 0x8a3a3a }),
    curtain: new THREE.MeshLambertMaterial({ color: 0xa04050, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    curtain2: new THREE.MeshLambertMaterial({ color: 0x3e6a8a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    curtain3: new THREE.MeshLambertMaterial({ color: 0x6a8a4a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    screen: new THREE.MeshLambertMaterial({ map: T.screen }),
    bronze: new THREE.MeshLambertMaterial({ color: 0x7a6038 }),
    ceramic: new THREE.MeshLambertMaterial({ color: 0xb0a080 }),
    lamp: new THREE.MeshLambertMaterial({ color: 0xf0d080, emissive: 0x000000 }),
    hill: new THREE.MeshLambertMaterial({ color: 0x5a6a78, flatShading: true }),
  };
  const group = new THREE.Group();
  const obstacles: Rect[] = [];
  const roofs: PalaceWorld["roofs"] = [];
  const lamps: THREE.Mesh[] = [];
  const platforms: { rect: Rect; h: number }[] = [];
  const interiors: PalaceWorld["interiors"] = [];
  const keep = new Set<THREE.Object3D>();
  const bounds: Rect = { x0: -70, z0: -92, x1: 70, z1: 90 };
  const seats: Record<Area, Seat[]> = { emperorHall: [], empressPalace: [], consortQuarters: [], ladiesStation: [], garden: [], bath: [], banquet: [], corridor: [] };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group): THREE.Mesh => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const block = (x0: number, z0: number, x1: number, z1: number): void => {
    obstacles.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) });
  };
  const lampAt = (x: number, z: number, y = 0, parent: THREE.Object3D = group, hanging = false): void => {
    if (hanging) {
      box(0.04, 0.6, 0.04, M.bronze, x, y + 2.7, z, parent);
      const l = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 8), M.lamp, x, y + 2.2, z, parent);
      lamps.push(l);
      keep.add(l);
      return;
    }
    mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.5, 6), M.bronze, x, y + 0.75, z, parent);
    mesh(new THREE.CylinderGeometry(0.26, 0.18, 0.12, 8), M.bronze, x, y + 1.52, z, parent);
    const l = mesh(new THREE.SphereGeometry(0.16, 8, 6), M.lamp, x, y + 1.7, z, parent);
    lamps.push(l);
    keep.add(l);
  };

  // ---------- 地面・遠景・空 ----------
  const ground = mesh(new THREE.PlaneGeometry(bounds.x1 - bounds.x0 + 60, bounds.z1 - bounds.z0 + 60), M.paving, 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const lawn = mesh(new THREE.PlaneGeometry(58, 74), M.grass, 0, 0.02, 40);
  lawn.rotation.x = -Math.PI / 2;
  lawn.castShadow = false;
  const snowPatch = mesh(new THREE.PlaneGeometry(58, 74), M.snow, 0, 0.03, 40);
  snowPatch.rotation.x = -Math.PI / 2;
  snowPatch.castShadow = false;
  for (const [x, z, w, d] of [[8, 30, 3, 36], [-4, 16, 20, 3], [14, 54, 20, 3]] as const) {
    const pth = mesh(new THREE.PlaneGeometry(w, d), M.gravel, x, 0.035, z);
    pth.rotation.x = -Math.PI / 2;
    pth.castShadow = false;
  }
  const skyGeo = new THREE.SphereGeometry(420, 24, 12);
  const skyCol = new Float32Array(skyGeo.getAttribute("position").count * 3);
  skyGeo.setAttribute("color", new THREE.BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  // 空は最後に描く(手前の建物で隠れる所は塗らない。ソフトウェア描画やスマートフォンで軽くなる)
  sky.renderOrder = 1e6;
  group.add(sky);
  keep.add(sky);
  const setSky = (top: number, horizon: number): void => {
    const a = new THREE.Color(top), b = new THREE.Color(horizon), c = new THREE.Color();
    const p = skyGeo.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, Math.min(1, p.getY(i) / 220));
      c.copy(b).lerp(a, Math.pow(t, 0.6));
      skyCol.set([c.r, c.g, c.b], i * 3);
    }
    (skyGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  };
  if (!low) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 260 + (i % 3) * 20;
      const hill = mesh(new THREE.ConeGeometry(40 + (i % 4) * 12, 30 + (i % 5) * 10, 5), M.hill, Math.cos(a) * r, 10, Math.sin(a) * r);
      hill.castShadow = false;
    }
  }

  // ---------- 外の塀と南門 ----------
  const wallH = 4.5;
  for (const [x0, z0, x1, z1] of [[bounds.x0, bounds.z0, bounds.x1, bounds.z0 + 1], [bounds.x0, bounds.z1 - 1, -7, bounds.z1], [7, bounds.z1 - 1, bounds.x1, bounds.z1], [bounds.x0, bounds.z0, bounds.x0 + 1, bounds.z1], [bounds.x1 - 1, bounds.z0, bounds.x1, bounds.z1]]) {
    box(x1 - x0, wallH, z1 - z0, M.wall, (x0 + x1) / 2, wallH / 2, (z0 + z1) / 2);
    box(x1 - x0 + 0.8, 0.45, z1 - z0 + 0.8, M.roof, (x0 + x1) / 2, wallH + 0.2, (z0 + z1) / 2);
    block(x0, z0, x1, z1);
  }
  block(-7, bounds.z1 - 1, 7, bounds.z1);

  type Hall = { inner: THREE.Group; toWorld: (x: number, z: number) => { x: number; z: number }; rot: number };
  /** 殿舎:基壇・階段・欄干・柱と斗栱・壁と格子の窓・格子戸・反りのある瓦屋根・鴟尾と隅棟。調度は inner(正面が +z)に置く */
  const hall = (cx: number, cz: number, w: number, d: number, facing: "s" | "e" | "w", base = 1.0, height = 5.2): Hall => {
    const rot = facing === "s" ? 0 : facing === "e" ? Math.PI / 2 : -Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rot;
    group.add(g);
    const toWorld = (x: number, z: number): { x: number; z: number } => ({ x: cx + x * Math.cos(rot) + z * Math.sin(rot), z: cz - x * Math.sin(rot) + z * Math.cos(rot) });
    box(w + 3, base, d + 3, M.stone, 0, base / 2, 0, g);
    box(w + 3.3, 0.12, d + 3.3, M.ridge, 0, base, 0, g);
    box(w, 0.06, d, M.wood, 0, base + 0.04, 0, g);
    const steps = Math.max(2, Math.round(base / 0.25));
    for (let i = 0; i < steps; i++) box(5, base * (1 - i / steps), 0.45, M.stone, 0, (base * (1 - i / steps)) / 2, (d + 3) / 2 + 0.22 + i * 0.45, g);
    const ex = (w + 3) / 2 - 0.1, ez = (d + 3) / 2 - 0.1;
    if (!low) {
      const rail = (x0: number, z0: number, x1: number, z1: number): void => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const m = box(len, 0.08, 0.08, M.redLacquer, (x0 + x1) / 2, base + 0.75, (z0 + z1) / 2, g);
        m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        const n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) box(0.1, 0.8, 0.1, M.redLacquer, x0 + ((x1 - x0) * i) / n, base + 0.4, z0 + ((z1 - z0) * i) / n, g);
      };
      rail(-ex, ez, -2.6, ez);
      rail(2.6, ez, ex, ez);
      rail(-ex, -ez, ex, -ez);
      rail(-ex, -ez, -ex, ez);
      rail(ex, -ez, ex, ez);
    }
    const cols = Math.max(3, Math.round(w / 4));
    const colPos: [number, number][] = [];
    for (let i = 0; i <= cols; i++) for (const z of [d / 2, -d / 2]) colPos.push([-w / 2 + (w * i) / cols, z]);
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.28, height, 10), M.pillar, colPos.length);
    const mtx = new THREE.Matrix4();
    colPos.forEach(([x, z], i) => pillars.setMatrixAt(i, mtx.makeTranslation(x, base + height / 2, z)));
    pillars.castShadow = true;
    g.add(pillars);
    keep.add(pillars);
    if (!low) {
      // 斗栱(柱の上の組物の推定):2段の箱
      const brackets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), M.bracket, colPos.length * 2);
      colPos.forEach(([x, z], i) => {
        brackets.setMatrixAt(i * 2, mtx.makeTranslation(x, base + height + 0.1, z));
        brackets.setMatrixAt(i * 2 + 1, new THREE.Matrix4().makeScale(1.6, 0.8, 1.2).setPosition(x, base + height + 0.4, z));
      });
      g.add(brackets);
      keep.add(brackets);
    }
    const wallMesh = (ww: number, x: number, z: number, side: boolean): void => {
      const ry = side ? Math.PI / 2 : 0;
      box(ww, height - 0.6, 0.25, M.wall, x, base + (height - 0.6) / 2, z, g).rotation.y = ry;
      box(ww, 0.35, 0.32, M.frame, x, base + height - 0.6, z, g).rotation.y = ry;
      box(ww, 0.3, 0.3, M.frame, x, base + 0.15, z, g).rotation.y = ry;
      if (!low) {
        const n = Math.max(1, Math.floor(ww / 4));
        for (let i = 0; i < n; i++) {
          const off = -ww / 2 + (ww * (i + 0.5)) / n;
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), M.lattice);
          win.position.set(side ? x + Math.sign(x) * 0.14 : x + off, base + height * 0.55, side ? z + off : z + 0.14);
          win.rotation.y = ry;
          g.add(win);
        }
      }
    };
    wallMesh(w, 0, -d / 2, false);
    wallMesh(d, -w / 2, 0, true);
    wallMesh(d, w / 2, 0, true);
    if (!low) for (const s of [-1, 1]) {
      const doorP = new THREE.Mesh(new THREE.PlaneGeometry(w / cols, height - 0.8), M.lattice);
      doorP.position.set(s * (w / 2 - w / cols / 2), base + (height - 0.8) / 2, d / 2 - 0.05);
      g.add(doorP);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(w / cols - 0.1, height - 0.9), M.paper);
      paper.position.set(s * (w / 2 - w / cols / 2), base + (height - 0.8) / 2, d / 2 - 0.08);
      g.add(paper);
    }
    box(w + 0.8, 0.55, d + 0.8, M.frame, 0, base + height + 0.6, 0, g);
    const roof = new THREE.Group();
    const RW = w + 4.5, RD = d + 4.5, RH = Math.min(w, d) * 0.42 + 1.3;
    const rm = new THREE.Mesh(curvedRoof(RW, RD, RH), M.roof);
    rm.castShadow = true;
    roof.add(rm);
    const rr = Math.max(0, RW / 2 - (RD / 2) * 0.92);
    box(rr * 2 + 0.6, 0.55, 0.55, M.ridge, 0, RH + 0.2, 0, roof);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 6, 12, Math.PI * 0.9), M.ridge);
      tail.position.set(s * (rr + 0.3), RH + 0.75, 0);
      tail.rotation.set(0, s > 0 ? Math.PI : 0, Math.PI * 0.55);
      roof.add(tail);
      if (!low) for (const sz of [-1, 1]) {
        // 隅棟:棟の端から軒の隅へ
        // 屋根の曲面(下が緩く上が急)に沿うよう、4つに分けて置く
        const at = (t: number): THREE.Vector3 => new THREE.Vector3(s * (RW / 2 + (rr - RW / 2) * t), 0.135 + (RH - 0.135) * Math.pow(t, 1.6) + 0.45 * (1 - t) + 0.12, sz * (RD / 2) * (1 - t));
        for (let q = 0; q < 4; q++) {
          const a = at(q / 4), b = at((q + 1) / 4);
          const hip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, a.distanceTo(b) + 0.05), M.ridge);
          hip.position.copy(a).add(b).multiplyScalar(0.5);
          hip.lookAt(b); // まだ親につないでいないので、屋根の中の座標のまま向ける
          roof.add(hip);
        }
      }
    }
    roof.position.y = base + height + 0.85;
    g.add(roof);
    keep.add(roof);
    const seg = (ax: number, az: number, bx: number, bz: number): void => {
      const a = toWorld(ax, az), b = toWorld(bx, bz);
      block(Math.min(a.x, b.x) - 0.3, Math.min(a.z, b.z) - 0.3, Math.max(a.x, b.x) + 0.3, Math.max(a.z, b.z) + 0.3);
    };
    seg(-w / 2, -d / 2, w / 2, -d / 2);
    seg(-w / 2, -d / 2, -w / 2, d / 2);
    seg(w / 2, -d / 2, w / 2, d / 2);
    if (!low) {
      seg(-ex, ez, -2.8, ez);
      seg(2.8, ez, ex, ez);
    }
    const c0 = toWorld(-(w + 3) / 2, -(d + 3) / 2), c1 = toWorld((w + 3) / 2, (d + 3) / 2);
    platforms.push({ rect: { x0: Math.min(c0.x, c1.x), z0: Math.min(c0.z, c1.z), x1: Math.max(c0.x, c1.x), z1: Math.max(c0.z, c1.z) }, h: base });
    const i0 = toWorld(-w / 2, -d / 2), i1 = toWorld(w / 2, d / 2);
    roofs.push({ mesh: roof, rect: { x0: Math.min(i0.x, i1.x), z0: Math.min(i0.z, i1.z), x1: Math.max(i0.x, i1.x), z1: Math.max(i0.z, i1.z) } });
    const inner = new THREE.Group();
    inner.position.y = base;
    g.add(inner);
    interiors.push({ group: inner, x: cx, z: cz });
    return { inner, toWorld, rot };
  };
  const seatAt = (area: Area, h: Hall, x: number, z: number, faceLocal: number, pose: Pose): void => {
    const p = h.toWorld(x, z);
    seats[area].push({ x: p.x, z: p.z, face: faceLocal + h.rot, pose });
  };
  const blockLocal = (h: Hall, x0: number, z0: number, x1: number, z1: number): void => {
    const a = h.toWorld(x0, z0), b = h.toWorld(x1, z1);
    block(Math.min(a.x, b.x), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.z, b.z));
  };

  // ---------- 調度 ----------
  const bed = (p: THREE.Object3D, x: number, z: number, cur: THREE.Material): void => {
    box(3.2, 0.55, 2.2, M.lacquer, x, 0.28, z, p);
    box(3.0, 0.1, 2.0, M.silk, x, 0.6, z, p);
    for (const [dx, dz] of [[-1.55, -1.05], [1.55, -1.05], [-1.55, 1.05], [1.55, 1.05]]) box(0.08, 2.4, 0.08, M.lacquer, x + dx, 1.2, z + dz, p);
    box(3.3, 0.08, 2.3, M.lacquer, x, 2.4, z, p);
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.9), cur);
      c.position.set(x + s * 1.0, 1.4, z + 1.06);
      p.add(c);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.9), cur);
    back.position.set(x, 1.4, z - 1.06);
    p.add(back);
  };
  const screenPanel = (p: THREE.Object3D, x: number, z: number, w = 4, h = 1.9, ry = 0): void => {
    box(w, h, 0.1, M.screen, x, h / 2 + 0.05, z, p).rotation.y = ry;
    box(w + 0.1, 0.1, 0.16, M.lacquer, x, 0.05, z, p).rotation.y = ry;
  };
  const lowTable = (p: THREE.Object3D, x: number, z: number, w = 1.3, d = 0.6, dishes = false): void => {
    box(w, 0.06, d, M.lacquer, x, 0.36, z, p);
    for (const [dx, dz] of [[-w / 2 + 0.08, -d / 2 + 0.08], [w / 2 - 0.08, -d / 2 + 0.08], [-w / 2 + 0.08, d / 2 - 0.08], [w / 2 - 0.08, d / 2 - 0.08]]) box(0.06, 0.34, 0.06, M.lacquer, x + dx, 0.17, z + dz, p);
    if (dishes) for (const dx of [-0.35, 0, 0.35]) mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.06, 10), M.ceramic, x + dx, 0.43, z, p);
  };
  const cushion = (p: THREE.Object3D, x: number, z: number): void => void box(0.7, 0.08, 0.7, M.cushion, x, 0.04, z, p);
  const chest = (p: THREE.Object3D, x: number, z: number): void => {
    box(1.4, 0.8, 0.7, M.redLacquer, x, 0.4, z, p);
    box(1.45, 0.06, 0.75, M.bronze, x, 0.82, z, p);
  };
  const censer = (p: THREE.Object3D, x: number, z: number): void => {
    mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.5, 8), M.bronze, x, 0.25, z, p);
    mesh(new THREE.ConeGeometry(0.18, 0.3, 7), M.bronze, x, 0.62, z, p);
  };
  const vessel = (p: THREE.Object3D, x: number, z: number): void => {
    mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.42, 10), M.bronze, x, 0.6, z, p);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 5), M.bronze, x + Math.cos(a) * 0.2, 0.2, z + Math.sin(a) * 0.2, p); }
  };
  const qin = (p: THREE.Object3D, x: number, z: number): void => {
    box(1.2, 0.06, 0.22, M.lacquer, x, 0.4, z, p);
    box(1.1, 0.3, 0.06, M.lacquer, x, 0.2, z, p);
  };
  const shelf = (p: THREE.Object3D, x: number, z: number, ry = 0): void => {
    box(1.6, 1.8, 0.45, M.wood, x, 0.9, z, p).rotation.y = ry;
    for (const y of [0.5, 1.0, 1.5]) box(1.4, 0.18, 0.3, M.silk, x, y, z, p).rotation.y = ry;
  };
  const loom = (p: THREE.Object3D, x: number, z: number): void => {
    box(1.6, 0.08, 1.0, M.wood, x, 0.6, z, p);
    for (const dx of [-0.75, 0.75]) box(0.08, 1.3, 0.08, M.wood, x + dx, 0.65, z - 0.45, p);
    box(1.6, 0.08, 0.08, M.wood, x, 1.25, z - 0.45, p);
    box(1.4, 0.6, 0.02, M.silk, x, 0.95, z - 0.44, p);
  };
  const mirror = (p: THREE.Object3D, x: number, z: number): void => {
    box(0.5, 0.5, 0.4, M.redLacquer, x, 0.25, z, p);
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16), M.bronze, x, 0.8, z - 0.1, p).rotation.x = Math.PI / 2 - 0.2;
  };

  // 1. 皇帝の寝殿:寝台・屏風・御座・灯火・衣装の箱・香炉
  const H1 = hall(0, -72, 30, 14, "s", 1.6, 6);
  if (!low) {
    bed(H1.inner, -8, -3.5, M.curtain);
    screenPanel(H1.inner, 4, -5.6, 7);
    box(5, 0.35, 2.6, M.lacquer, 4, 0.18, -3.6, H1.inner);
    lowTable(H1.inner, 4, -2.4, 1.6, 0.7);
    chest(H1.inner, 12, -5.4);
    chest(H1.inner, 9.6, -5.4);
    censer(H1.inner, 1, -1);
    for (const x of [-3, 8]) lampAt(x, 2, 0, H1.inner);
    blockLocal(H1, -9.8, -5, -6.2, -2.2);
  }
  seatAt("emperorHall", H1, 2, 1.5, 0, "stand");
  seatAt("emperorHall", H1, 10, 0, -Math.PI / 2, "stand");
  for (const x of [-12, 12]) { const p = H1.toWorld(x, 10); lampAt(p.x, p.z); }
  // 2. 皇后の宮殿:座所・屏風・儀礼の器・女官の控える敷物
  const H2 = hall(0, -40, 24, 12, "s", 1.2, 5.4);
  if (!low) {
    box(4, 0.45, 2.4, M.redLacquer, 0, 0.22, -3.6, H2.inner);
    screenPanel(H2.inner, 0, -5, 5);
    for (const x of [-3.5, 3.5]) vessel(H2.inner, x, -3.8);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) cushion(H2.inner, s * (3 + i * 1.4), 0.5);
    box(0.05, 3, 6, M.curtain, -10, 1.6, -2, H2.inner);
    box(0.05, 3, 6, M.curtain, 10, 1.6, -2, H2.inner);
    lampAt(-6, -4, 0, H2.inner);
    lampAt(6, -4, 0, H2.inner);
  }
  seatAt("empressPalace", H2, 0, -3.6, 0, "sit");
  for (let i = 0; i < 3; i++) seatAt("empressPalace", H2, -(3 + i * 1.4), 0.5, Math.PI / 2, "sit");
  for (let i = 0; i < 3; i++) seatAt("empressPalace", H2, 3 + i * 1.4, 0.5, -Math.PI / 2, "sit");
  for (const x of [-9, 9]) { const p = H2.toWorld(x, 9); lampAt(p.x, p.z); }
  // 3. 妃たちの居所(北ほど位が高く、調度が豊か。好みの品が違う)
  [-52, -28, -4].forEach((z, i) => {
    const H = hall(50, z, 16, 10, "w", 0.9, 4.6);
    const cur = [M.curtain, M.curtain2, M.curtain3][i];
    if (!low) {
      bed(H.inner, 3.5, -2.6, cur);
      lowTable(H.inner, -2, -1, 1.2, 0.6);
      mirror(H.inner, -5.5, -3.8);
      if (i === 0) { screenPanel(H.inner, -2, -4.2, 4); censer(H.inner, 0, 0.5); vessel(H.inner, -6, 2); }
      if (i === 1) { shelf(H.inner, -6.6, -2, Math.PI / 2); qin(H.inner, -3, 1.6); }
      if (i === 2) { loom(H.inner, -5, 1); mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.5, 8), M.ceramic, -6.8, 0.25, -4, H.inner); }
      lampAt(-6.6, -4, 0, H.inner);
      blockLocal(H, 1.9, -4, 5.1, -1.4);
    }
    seatAt("consortQuarters", H, -2, 0.2, Math.PI, i === 1 ? "read" : "sit");
    seatAt("consortQuarters", H, -3, 2.6, 0, i === 1 ? "play" : "stand");
    const p = H.toWorld(-2, 8);
    lampAt(p.x, p.z);
  });
  // 4. 女官の詰所:棚・機・机と敷物(仕事と語らいの場)・水がめ
  const H4 = hall(-50, -30, 34, 11, "e", 0.8, 4.4);
  if (!low) {
    for (const x of [-13, -9, -5]) shelf(H4.inner, x, -4.6);
    loom(H4.inner, 9, -2);
    loom(H4.inner, 13, -2);
    for (const x of [-6, 0, 6]) { lowTable(H4.inner, x, 0.5, 1.6, 0.7); cushion(H4.inner, x - 0.5, 1.4); cushion(H4.inner, x + 0.5, 1.4); }
    for (const x of [-14, 14]) mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.7, 10), M.ceramic, x, 0.35, 2.8, H4.inner);
    lampAt(-2, -4.2, 0, H4.inner);
  }
  for (const x of [-6, 0, 6]) { seatAt("ladiesStation", H4, x - 0.5, 1.4, Math.PI, "read"); seatAt("ladiesStation", H4, x + 0.5, 1.4, Math.PI, "sit"); }
  seatAt("ladiesStation", H4, 9, -1.1, Math.PI, "play");
  { const p = H4.toWorld(0, 8); lampAt(p.x, p.z); }
  // 5. 浴殿:石の湯船・湯をくむ水場・桶・屏風。湯気が立つ(推定)
  const H5 = hall(-50, -74, 18, 12, "e", 0.6, 4.2);
  const steam: THREE.Sprite[] = [];
  {
    const pool = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 7), M.bath);
    pool.position.set(-1, 0.15, 0);
    H5.inner.add(pool);
    for (const [w, d, x, z] of [[5.6, 0.4, -1, -3.7], [5.6, 0.4, -1, 3.7], [0.4, 7.4, -3.8, 0], [0.4, 7.4, 1.8, 0]]) box(w, 0.6, d, M.stone, x, 0.3, z, H5.inner);
    blockLocal(H5, -4, -3.9, 2, 3.9);
    if (!low) {
      box(1.4, 0.8, 1.4, M.stone, 5, 0.4, -3, H5.inner);
      for (const z of [-1, 1]) mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 10), M.wood, 5, 0.2, z, H5.inner);
      screenPanel(H5.inner, 5.5, 3, 3, 1.8, Math.PI / 2);
      const sm = new THREE.SpriteMaterial({ map: T.steam, transparent: true, depthWrite: false, opacity: 0.5 });
      for (let i = 0; i < (high ? 18 : 9); i++) {
        const sp = new THREE.Sprite(sm);
        const p = H5.toWorld(-1 + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
        sp.position.set(p.x, 0.8 + Math.random() * 2.5, p.z);
        sp.scale.setScalar(1.4 + Math.random());
        sp.userData = { base: sp.position.clone(), t: Math.random() * 3 };
        group.add(sp);
        keep.add(sp);
        steam.push(sp);
      }
    }
  }
  seatAt("bath", H5, 4, -1, Math.PI / 2, "stand");
  seatAt("bath", H5, 4, 1.5, Math.PI / 2, "stand");
  { const p = H5.toWorld(0, 8); lampAt(p.x, p.z); }
  // 6. 宴会場:卓と器・敷物・主の座と屏風・楽人の場(琴・編鐘・鼓の推定)・吊り灯籠
  const H6 = hall(-48, 44, 22, 20, "e", 1.0, 5.6);
  if (!low) {
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { lowTable(H6.inner, -6 + i * 3.4, s * 3.8, 1.4, 0.6, true); cushion(H6.inner, -6 + i * 3.4, s * 3.8 + s * 0.8); }
    box(5, 0.4, 5, M.redLacquer, 8.5, 0.2, 0, H6.inner);
    screenPanel(H6.inner, 9.6, 0, 6, 2.2, Math.PI / 2);
    qin(H6.inner, -8.5, -0.8);
    box(0.1, 1.8, 3, M.lacquer, -9.5, 0.9, 1.6, H6.inner);
    box(0.1, 0.1, 3, M.lacquer, -9.5, 1.8, 1.6, H6.inner);
    for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.16, 0.36, 6, 1, true), M.bronze, -9.5, 1.45, 0.4 + i * 0.6, H6.inner);
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12), M.redLacquer, -7.5, 0.5, 2.2, H6.inner).rotation.z = Math.PI / 2;
    for (const z of [-6, 6]) lampAt(0, z, 0, H6.inner, true);
  }
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) seatAt("banquet", H6, -6 + i * 3.4, s * 3.8 + s * 0.8, s > 0 ? Math.PI : 0, "eat");
  seatAt("banquet", H6, -8.5, -0.1, Math.PI / 2, "play");
  for (const x of [-8, 8]) { const p = H6.toWorld(x, 12); lampAt(p.x, p.z); }

  // 7. 回廊:屋根つきの柱の列・欄干・吊り灯籠
  const corridor = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const g = new THREE.Group();
    g.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    g.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    group.add(g);
    const n = Math.max(2, Math.round(len / 3.5));
    const ps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.19, 3.2, 8), M.pillar, (n + 1) * 2);
    const mtx = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i <= n; i++) for (const sx of [-2, 2]) ps.setMatrixAt(k++, mtx.makeTranslation(sx, 1.6, -len / 2 + (len * i) / n));
    g.add(ps);
    keep.add(ps);
    box(4.2, 0.12, len, M.stone, 0, 0.06, 0, g);
    if (!low) {
      for (const sx of [-2, 2]) {
        box(0.08, 0.08, len, M.redLacquer, sx, 0.7, 0, g);
        box(0.06, 0.06, len, M.redLacquer, sx, 0.35, 0, g);
      }
      for (let i = 0; i < n; i += 2) lampAt(0, -len / 2 + (len * (i + 0.5)) / n, 0, g, true);
    }
    const roofOnly = new THREE.Group();
    const top = new THREE.Mesh(curvedRoof(5.4, len + 0.8, 0.9), M.roof);
    top.position.y = 3.2;
    top.castShadow = true;
    roofOnly.add(top);
    box(0.35, 0.35, len + 0.8, M.ridge, 0, 4.15, 0, roofOnly);
    g.add(roofOnly);
    keep.add(roofOnly);
    roofs.push({ mesh: roofOnly, rect: { x0: Math.min(x0, x1) - 3, z0: Math.min(z0, z1) - 3, x1: Math.max(x0, x1) + 3, z1: Math.max(z0, z1) + 3 } });
  };
  corridor(0, 84, 0, 12);
  corridor(0, -4, 0, -30);
  corridor(-30, -12, 30, -12);
  corridor(-32, -12, -40, -12);
  corridor(32, -12, 40, -12);
  box(14, 6, 3, M.wall, -9.5, 3, 89);
  box(14, 6, 3, M.wall, 9.5, 3, 89);
  const gateRoof = new THREE.Mesh(curvedRoof(36, 7, 2.6), M.roof);
  gateRoof.position.set(0, 6.2, 89);
  group.add(gateRoof);
  keep.add(gateRoof);

  // 8. 後宮の庭園:池・縁石・蓮(夏)・太鼓橋・八角の亭・湖石・樹木(季節で変わる)
  const pond = mesh(new THREE.CircleGeometry(1, 40), M.water, -10, 0.05, 40);
  pond.scale.set(14, 9, 1);
  pond.rotation.x = -Math.PI / 2;
  pond.castShadow = false;
  keep.add(pond);
  if (!low) for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; mesh(new THREE.DodecahedronGeometry(0.5, 0), M.rock, -10 + Math.cos(a) * 14.3, 0.2, 40 + Math.sin(a) * 9.3).castShadow = false; }
  for (let i = -6; i <= 6; i++) {
    const t = i / 6.5;
    const hz = 9 * Math.sqrt(Math.max(0, 1 - t * t));
    const x = -10 + t * 14;
    if (Math.abs(x - -10) >= 1.4) block(x - 1.2, 40 - hz, x + 1.2, 40 + hz);
  }
  const lotus: THREE.Mesh[] = [];
  if (!low) for (let i = 0; i < 16; i++) {
    const l = mesh(new THREE.CircleGeometry(0.6 + (i % 3) * 0.2, 10), M.lotus, -16 + (i % 8) * 1.8, 0.08, 36 + Math.floor(i / 8) * 7 + (i % 2));
    l.rotation.x = -Math.PI / 2;
    lotus.push(l);
    keep.add(l);
  }
  for (let i = 0; i < 10; i++) {
    const z = 30 + i * 2;
    const y = 0.15 + Math.sin((i / 9) * Math.PI) * 0.9;
    box(2.6, 0.2, 2.1, M.wood, -10, y, z);
    if (!low) for (const sx of [-1.25, 1.25]) box(0.08, 0.6, 2.1, M.redLacquer, -10 + sx, y + 0.4, z);
  }
  {
    const g = new THREE.Group();
    g.position.set(14, 0, 30);
    group.add(g);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.14, 0.16, 3, 6), M.pillar, Math.cos(a) * 2.6, 1.8, Math.sin(a) * 2.6, g); }
    mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 8), M.stone, 0, 0.15, 0, g);
    mesh(new THREE.ConeGeometry(4.2, 2.4, 8), M.roof, 0, 4.4, 0, g).rotation.y = Math.PI / 8;
    mesh(new THREE.SphereGeometry(0.3, 8, 6), M.bronze, 0, 5.7, 0, g);
    lowTable(g, 0, 0, 1.2, 1.2);
  }
  seats.garden.push({ x: 14, z: 31.4, face: Math.PI, pose: "read" }, { x: 12.6, z: 30, face: Math.PI / 2, pose: "play" }, { x: 15.4, z: 29, face: -Math.PI / 2, pose: "sit" });
  const rock = (x: number, z: number, s: number): void => {
    for (let i = 0; i < (low ? 1 : 3); i++) {
      const m = mesh(new THREE.DodecahedronGeometry(s * (1 - i * 0.25), 0), M.rock, x + (i % 2) * s * 0.3, s * 0.6 + i * s * 0.9, z);
      m.scale.set(1, 1.3, 0.8);
      m.rotation.y = i;
    }
    block(x - s * 0.8, z - s * 0.8, x + s * 0.8, z + s * 0.8);
  };
  rock(-22, 30, 1.6);
  rock(4, 52, 1.2);
  rock(20, 60, 2);
  rock(-24, 56, 1.3);
  const deciduous: THREE.Mesh[] = [];
  const tree = (x: number, z: number, kind: "willow" | "pine" | "plum" | "maple"): void => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    group.add(g);
    mesh(new THREE.CylinderGeometry(0.16, 0.3, kind === "pine" ? 5 : 3.2, 6), M.trunk, 0, kind === "pine" ? 2.5 : 1.6, 0, g);
    if (kind === "willow") {
      for (let i = 0; i < (low ? 3 : 7); i++) {
        const a = (i / 7) * Math.PI * 2;
        mesh(new THREE.ConeGeometry(0.9, 3.4, 5, 1, true), M.willow, Math.cos(a) * 1.1, 2.6, Math.sin(a) * 1.1, g).rotation.x = Math.PI;
      }
      mesh(new THREE.SphereGeometry(1.4, 8, 6), M.willow, 0, 3.6, 0, g);
    } else if (kind === "pine") {
      for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(2.2 - i * 0.5, 1.8, 7), M.pine, 0, 3.4 + i * 1.2, 0, g);
    } else {
      const mat = kind === "plum" ? M.blossom : M.maple;
      const crown = new THREE.Group();
      g.add(crown);
      for (let i = 0; i < (low ? 1 : 3); i++) mesh(new THREE.IcosahedronGeometry(1.3 - i * 0.2, 0), mat, (i - 1) * 0.8, 3.4 + (i % 2) * 0.5, (i % 2) * 0.6, crown);
      keep.add(crown);
      deciduous.push(...(crown.children as THREE.Mesh[]));
    }
    block(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
  };
  for (const [x, z] of [[-24, 36], [3, 32], [-18, 50], [2, 46]]) tree(x, z, "willow");
  for (const [x, z] of [[24, 12], [-26, 14], [24, 70], [-20, 72]]) tree(x, z, "pine");
  for (const [x, z] of [[18, 44], [22, 50], [12, 64]]) tree(x, z, "plum");
  for (const [x, z] of [[26, 38], [-26, 64], [26, 26]]) tree(x, z, "maple");
  for (const x of [-18, 18]) tree(x, -58, "pine");
  seats.garden.push({ x: -10, z: 33, face: 0, pose: "stand" }, { x: 4, z: 30, face: -Math.PI / 2, pose: "stand" }, { x: 18, z: 47, face: Math.PI, pose: "stand" });
  seats.corridor.push({ x: -2.4, z: 60, face: Math.PI / 2, pose: "stand" }, { x: 2.4, z: 30, face: -Math.PI / 2, pose: "read" }, { x: -20, z: -10.5, face: Math.PI, pose: "stand" });

  // ---------- 区画・立つ所・入口 ----------
  const inR = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const zones: [Area, Rect][] = [
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
    emperorHall: [{ x: -6, z: -60 }, { x: 6, z: -60 }, { x: 0, z: -58 }, { x: -10, z: -57 }],
    empressPalace: [{ x: -5, z: -32 }, { x: 5, z: -32 }, { x: 0, z: -31 }, { x: -12, z: -31 }],
    consortQuarters: [{ x: 41, z: -52 }, { x: 41, z: -28 }, { x: 41, z: -4 }, { x: 38, z: -16 }, { x: 38, z: -40 }],
    ladiesStation: [{ x: -42, z: -40 }, { x: -42, z: -30 }, { x: -42, z: -20 }, { x: -39, z: -26 }],
    bath: [{ x: -42, z: -78 }, { x: -42, z: -70 }, { x: -39, z: -74 }],
    banquet: [{ x: -40, z: 38 }, { x: -40, z: 50 }, { x: -37, z: 44 }, { x: -36, z: 40 }],
    garden: [{ x: 10, z: 24 }, { x: 18, z: 34 }, { x: -10, z: 20 }, { x: -10, z: 58 }, { x: 16, z: 56 }, { x: -4, z: 66 }, { x: 22, z: 20 }],
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

  // ---------- 季節 ----------
  let season: PalaceWorld["season"] = "spring";
  const setSeason = (month: number): void => {
    season = month >= 2 && month <= 4 ? "spring" : month >= 5 && month <= 7 ? "summer" : month >= 8 && month <= 10 ? "autumn" : "winter";
    M.blossom.color.setHex(season === "spring" ? 0xf0b0c4 : season === "summer" ? 0x5e8a40 : season === "autumn" ? 0xb0703a : 0x6a5a4a);
    M.maple.color.setHex(season === "autumn" ? 0xd0502a : season === "winter" ? 0x6a5a4a : 0x5e8a40);
    M.willow.color.setHex(season === "spring" ? 0x9ab858 : season === "summer" ? 0x6a9a44 : season === "autumn" ? 0xc0a848 : 0x8a8a6a);
    M.grass.color.setHex(season === "winter" ? 0x8a8a70 : season === "autumn" ? 0x7a7a48 : 0x5f7a45);
    M.snow.opacity = season === "winter" ? 0.55 : 0;
    for (const d of deciduous) d.visible = season !== "winter";
    for (const l of lotus) l.visible = season === "summer";
  };

  // ---------- まとめ描き(場所と材質ごと。屋根・柱・灯火・湯気・空・室内は別にまとめる) ----------
  for (const it of interiors) {
    keep.add(it.group);
    // 室内の家具は屋根の下にあるため、影を落とさない(影の描画を軽くする)
    mergeStatic(it.group, new Set(lamps), 999, false);
  }
  mergeStatic(group, keep);
  const tick = (dt: number, t: number): void => {
    for (const s of steam) {
      const u = s.userData as { base: THREE.Vector3; t: number };
      u.t += dt * 0.35;
      const f = u.t % 1;
      s.position.set(u.base.x + Math.sin(u.t * 3) * 0.3, 0.8 + f * 3.2, u.base.z);
      s.scale.setScalar(1.2 + f * 1.6);
    }
    M.water.color.setHSL(0.53, 0.3, 0.33 + Math.sin(t * 0.8) * 0.01);
  };
  return { group, obstacles, roofs, areaAt, spots, seats, doors, lamps, bounds, floorAt, interiors, setSeason, setSky, tick, get season() { return season; } };
}

/** 動かない飾りを、材質と場所(40m ごと)ごとに1つの形にまとめる(描く回数を減らす。画面の外の区切りは描かない) */
function mergeStatic(group: THREE.Object3D, keep: Set<THREE.Object3D>, chunk = 80, castShadow = true): void {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map<string, { mat: THREE.Material; list: THREE.BufferGeometry[]; shadow: boolean }>();
  const drop: THREE.Mesh[] = [];
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
    for (let p: THREE.Object3D | null = m; p && p !== group; p = p.parent) if (keep.has(p)) return;
    const mat = m.material as THREE.Material;
    let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    box.setFromBufferAttribute(g.getAttribute("position") as THREE.BufferAttribute).getCenter(c);
    const key = `${mat.uuid}|${Math.floor(c.x / chunk)}|${Math.floor(c.z / chunk)}`;
    const e = byMat.get(key) ?? byMat.set(key, { mat, list: [], shadow: false }).get(key)!;
    e.list.push(g);
    e.shadow ||= m.castShadow;
    drop.push(m);
  });
  for (const m of drop) {
    m.geometry.dispose();
    m.parent?.remove(m);
  }
  for (const { mat, list, shadow } of byMat.values()) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow && castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
