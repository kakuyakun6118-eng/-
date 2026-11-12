// 都市の設計図(CityLayout)から、城壁・城門・宮殿・民家などの部品を並べる。
// ここでは「どの部品を、どこに、どの大きさで置くか」の一覧を作るだけで、描画はしない。
//
// 座標の決まり:都市の中心が原点。x は東、z は南、y は上。地面は y = 0。
import type { CityLayout, PalaceSpec } from "../../data/types";
import type { PartShape, PartSurface } from "./CityParts";

/** どの距離まで表示するか。0 = 遠くでも表示 / 1 = 中距離から / 2 = 近距離だけ */
export type DetailTier = 0 | 1 | 2;

export interface CityPart {
  shape: PartShape;
  surface: PartSurface;
  tier: DetailTier;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  /** 上から見た回転(ラジアン) */
  rot: number;
  color: string;
}

export interface CityBlueprint {
  parts: CityPart[];
  /** 都市の半径(タップの当たり判定や選択の輪に使う) */
  radius: number;
  /** いちばん高い建物の高さ(都市名ラベルの位置に使う) */
  height: number;
}

// --- 色。建物は土・木・瓦の自然な色にし、勢力の色は旗だけに使う ---
const C = {
  ground: "#94875f",
  street: "#bfae88",
  court: "#b3a684",
  earthWall: "#b59a6c",
  parapet: "#c8b085",
  stone: "#8d897f",
  platform: "#b8b2a4",
  doorway: "#2a211c",
  timber: "#8c3b2a", // 朱塗りの柱や壁
  palaceWall: "#9a5140",
  wood: "#6f4a33",
  pole: "#3a2e26",
  tile: "#5c5f63",
  tileDark: "#3e4246",
  thatch: "#8d7c52",
  water: "#3f6d84",
  bridge: "#7a6248",
};
const HOUSE_WALLS = ["#d6ccb4", "#c9bd9f", "#b9a47c", "#a98f68", "#cfc2a3"];
const HOUSE_ROOFS = ["#5c5f63", "#66686a", "#54575c", "#6b6558"];

type Side = "n" | "s" | "e" | "w";
interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 毎回同じ並びになる乱数(都市ごとに決まった見た目にするため) */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildCity(layout: CityLayout, cityId: string, flagColor: string): CityBlueprint {
  const parts: CityPart[] = [];
  const rand = createRandom(hashString(cityId));
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

  const [W, D] = layout.size;
  const hw = W / 2;
  const hd = D / 2;
  const wh = layout.wallHeight;
  const wt = layout.wallThickness;
  const gw = layout.gateWidth;

  const add = (
    shape: PartShape, surface: PartSurface, tier: DetailTier,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, color: string,
  ): void => {
    parts.push({ shape, surface, tier, x, y, z, sx, sy, sz, rot, color });
  };

  /** 建物1棟(壁 + 屋根)。棟が長い辺に沿うように向きを決める。屋根の頂上の高さを返す */
  const building = (
    tier: DetailTier, x: number, y: number, z: number, w: number, h: number, d: number,
    wall: string, roof: string, roofHeight = 0.55, pyramid = false,
  ): number => {
    const turn = d > w;
    const along = turn ? d : w;
    const across = turn ? w : d;
    const rot = turn ? Math.PI / 2 : 0;
    add("box", "body", tier, x, y, z, along, h, across, rot, wall);
    const rh = Math.min(along, across) * roofHeight;
    add(pyramid ? "pyramid" : "hip", "tile", tier, x, y + h, z, along * 1.28, rh, across * 1.45, rot, roof);
    return y + h + rh;
  };

  /** 楼閣:上に行くほど小さくなる建物を重ねる。頂上の高さを返す */
  const tower = (
    tier: DetailTier, x: number, y: number, z: number, w: number, d: number, storeyHeight: number,
    storeys: number, wall: string, roof: string,
  ): number => {
    let top = y;
    for (let i = 0; i < storeys; i++) {
      const k = 1 - 0.2 * i;
      const last = i === storeys - 1;
      const turn = d > w;
      const rot = turn ? Math.PI / 2 : 0;
      const along = (turn ? d : w) * k;
      const across = (turn ? w : d) * k;
      add("box", "body", tier, x, top, z, along, storeyHeight, across, rot, wall);
      // 途中の階は低いひさし、最上階は高い屋根
      const rh = storeyHeight * (last ? 0.85 : 0.4);
      add("hip", "tile", tier, x, top + storeyHeight * (last ? 1 : 0.75), z, along * 1.4, rh, across * 1.6, rot, roof);
      top += storeyHeight * (last ? 1 : 0.95);
      if (last) top += rh;
    }
    return top;
  };

  /** 旗:竿と、勢力の色の布 */
  const flag = (tier: DetailTier, x: number, y: number, z: number, size: number): void => {
    add("box", "body", tier, x, y, z, size * 0.07, size * 1.5, size * 0.07, 0, C.pole);
    add("box", "body", tier, x + size * 0.36, y + size * 0.85, z, size * 0.66, size * 0.6, size * 0.04, 0, flagColor);
  };

  // 城壁の4辺。t は辺に沿った位置、out は外向きにずらす量
  const sideLength = (s: Side): number => (s === "n" || s === "s" ? W : D);
  const sideRot = (s: Side): number => (s === "n" || s === "s" ? 0 : Math.PI / 2);
  const onSide = (s: Side, t: number, out: number): [number, number] => {
    if (s === "s") return [t, hd + out];
    if (s === "n") return [t, -hd - out];
    if (s === "e") return [hw + out, t];
    return [-hw - out, t];
  };
  /** 辺の上の城門の位置 */
  const gatePositions = (s: Side): number[] => {
    const n = layout.gates[s];
    const len = sideLength(s);
    return Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1) - 0.5) * len);
  };

  // ===== 地面・濠 =====
  const moatWidth = layout.moat ? 0.13 : 0;
  const moatGap = layout.moat ? 0.07 : 0;
  // 城内の地面(踏み固めた土)。城外の家は、平らにならした地形の上にそのまま建てる
  const margin = 0.07 + moatGap + moatWidth;
  add("box", "body", 0, 0, -0.4, 0, W + margin * 2, 0.4, D + margin * 2, 0, C.ground);
  if (layout.moat) {
    const r = moatGap + wt / 2 + moatWidth / 2;
    add("box", "water", 0, 0, 0.002, hd + r, W + r * 2 + moatWidth, 0.004, moatWidth, 0, C.water);
    add("box", "water", 0, 0, 0.002, -hd - r, W + r * 2 + moatWidth, 0.004, moatWidth, 0, C.water);
    add("box", "water", 0, hw + r, 0.002, 0, moatWidth, 0.004, D + r * 2 + moatWidth, 0, C.water);
    add("box", "water", 0, -hw - r, 0.002, 0, moatWidth, 0.004, D + r * 2 + moatWidth, 0, C.water);
  }

  // ===== 大通り(城門から城内へ伸びる) =====
  const streetW = Math.max(0.035, gw * 0.4);
  const streetsX = [...new Set([...gatePositions("n"), ...gatePositions("s")].map((v) => Math.round(v * 100) / 100))];
  const streetsZ = [...new Set([...gatePositions("e"), ...gatePositions("w")].map((v) => Math.round(v * 100) / 100))];
  for (const x of streetsX) add("box", "body", 1, x, 0.002, 0, streetW, 0.003, D - wt, 0, C.street);
  for (const z of streetsZ) add("box", "body", 1, 0, 0.002, z, W - wt, 0.003, streetW, 0, C.street);

  let maxHeight = wh;
  const reserved: Rect[] = []; // 民家を建てない場所

  // ===== 城壁と城門 =====
  for (const s of ["n", "s", "e", "w"] as Side[]) {
    const len = sideLength(s);
    const rot = sideRot(s);
    const gates = gatePositions(s);
    // 城門のあいだを城壁でつなぐ
    const cuts = [-len / 2, ...gates.flatMap((g) => [g - gw / 2, g + gw / 2]), len / 2];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 0.01) continue;
      const [x, z] = onSide(s, (a + b) / 2, 0);
      add("wall", "body", 0, x, 0, z, b - a, wh, wt, rot, C.earthWall);
      // 城壁の上の胸壁(外側の縁)
      const [px, pz] = onSide(s, (a + b) / 2, wt * 0.22);
      add("box", "body", 1, px, wh, pz, b - a, wh * 0.14, wt * 0.2, rot, C.parapet);
    }

    gates.forEach((g, gi) => {
      // 南の中央の門を正門として大きくする
      const grand = layout.grandGate && s === "s" && gi === Math.floor(gates.length / 2);
      const k = grand ? 1.4 : 1;
      const [x, z] = onSide(s, g, 0);
      // 門の土台(石積み)と、暗い通り抜け
      add("box", "body", 0, x, 0, z, gw * 1.3 * k, wh * 1.2 * k, wt * 1.5, rot, C.stone);
      add("box", "body", 0, x, 0, z, gw * 0.42 * k, wh * 0.78 * k, wt * 1.56, rot, C.doorway);
      // 門の上の楼閣
      const along = gw * 1.1 * k;
      const across = wt * 1.15;
      const top = tower(
        0, x, wh * 1.2 * k, z,
        rot === 0 ? along : across, rot === 0 ? across : along,
        wh * 0.5 * k, layout.gateStoreys + (grand ? 1 : 0), C.timber, C.tileDark,
      );
      maxHeight = Math.max(maxHeight, top);
      flag(0, x, top - wh * 0.2, z, wh * 0.9 * k);

      if (grand) {
        // 正門の左右に立つ「闕(けつ)」
        for (const dir of [-1, 1]) {
          const [qx, qz] = onSide(s, g + dir * gw * 1.25, wt * 1.6);
          add("box", "body", 0, qx, 0, qz, gw * 0.42, wh * 1.5, gw * 0.42, 0, C.stone);
          building(0, qx, wh * 1.5, qz, gw * 0.4, wh * 0.4, gw * 0.4, C.timber, C.tileDark, 0.8, true);
        }
      }
      if (layout.moat) {
        const [bx, bz] = onSide(s, g, moatGap + wt / 2 + moatWidth / 2);
        add("box", "body", 0, bx, 0.004, bz, gw * 0.5, 0.012, moatWidth * 1.25, rot, C.bridge);
      }
    });

    // 望楼(城壁から外へ張り出す)
    const nTowers = layout.wallTowers;
    for (let i = 0; i < nTowers; i++) {
      const t = ((i + 0.5) / nTowers - 0.5) * len;
      if (gates.some((g) => Math.abs(g - t) < gw * 1.2)) continue;
      const [x, z] = onSide(s, t, wt * 0.45);
      add("box", "body", 1, x, 0, z, wt * 1.3, wh * 1.06, wt * 1.5, rot, C.earthWall);
      if (layout.gateStoreys >= 2 || layout.wallTowers >= 3) {
        const top = building(1, x, wh * 1.06, z, wt * 1.0, wh * 0.32, wt * 1.0, C.wood, C.tile, 0.7, true);
        maxHeight = Math.max(maxHeight, top);
      }
    }
  }

  // ===== 角楼 =====
  if (layout.cornerTowers) {
    for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
      add("box", "body", 0, cx, 0, cz, wt * 1.7, wh * 1.18, wt * 1.7, 0, C.earthWall);
      const top = building(0, cx, wh * 1.18, cz, wt * 1.4, wh * 0.42, wt * 1.4, C.timber, C.tileDark, 0.75, true);
      maxHeight = Math.max(maxHeight, top);
      if (layout.gateStoreys >= 2) flag(1, cx, top - wh * 0.15, cz, wh * 0.6);
    }
  }

  // ===== 宮殿・役所 =====
  const compound = (p: PalaceSpec): void => {
    const cx = p.center[0] * W;
    const cz = p.center[1] * D;
    const w = p.size[0] * W;
    const d = p.size[1] * D;
    const palace = p.grade === 2;
    reserved.push({ x0: cx - w / 2 - 0.04, z0: cz - d / 2 - 0.04, x1: cx + w / 2 + 0.04, z1: cz + d / 2 + 0.04 });
    add("box", "body", 1, cx, 0.004, cz, w, 0.004, d, 0, C.court);

    // 囲いの塀(瓦をのせた赤土の塀)。南に門を開ける
    const fh = wh * (palace ? 0.6 : 0.45);
    const ft = wt * 0.3;
    const fence = (x: number, z: number, len: number, rot: number): void => {
      add("box", "body", 0, x, 0, z, len, fh, ft, rot, C.palaceWall);
      add("hip", "tile", 1, x, fh, z, len, fh * 0.3, ft * 2.4, rot, C.tileDark);
    };
    const gap = w * 0.16;
    fence(cx, cz - d / 2, w, 0);
    fence(cx - w / 2, cz, d, Math.PI / 2);
    fence(cx + w / 2, cz, d, Math.PI / 2);
    fence(cx - (w + gap) / 4, cz + d / 2, (w - gap) / 2, 0);
    fence(cx + (w + gap) / 4, cz + d / 2, (w - gap) / 2, 0);
    building(1, cx, 0, cz + d / 2, gap * 0.95, fh * 1.1, ft * 3.5, C.timber, C.tileDark, 0.9);

    // 中心線に殿舎を南から北へ並べる。2番目(1棟だけなら1番目)を正殿として大きくする
    const n = Math.max(1, p.halls);
    const main = n > 1 ? 1 : 0;
    const slot = (d * 0.84) / n;
    for (let i = 0; i < n; i++) {
      const z = cz + d * 0.42 - slot * (i + 0.5);
      const big = i === main;
      const hallW = Math.min(w * (big ? 0.5 : 0.36), 0.42);
      const hallD = Math.min(slot * (big ? 0.62 : 0.5), hallW * 0.62);
      const hallH = hallD * (palace ? 0.55 : 0.45);
      const base = palace ? (big ? 0.03 : 0.016) : 0.008;
      // 基壇(石の土台)
      add("box", "body", big ? 0 : 1, cx, 0, z, hallW * 1.35, base, hallD * 1.6, 0, C.platform);
      let top: number;
      if (palace && big) {
        // 正殿は屋根を二重にする(重檐)
        add("box", "body", 0, cx, base, z, hallW, hallH, hallD, 0, C.timber);
        add("hip", "tile", 0, cx, base + hallH * 0.8, z, hallW * 1.36, hallH * 0.42, hallD * 1.75, 0, C.tileDark);
        add("box", "body", 0, cx, base + hallH, z, hallW * 0.74, hallH * 0.5, hallD * 0.7, 0, C.timber);
        add("hip", "tile", 0, cx, base + hallH * 1.5, z, hallW * 1.02, hallH * 0.85, hallD * 1.22, 0, C.tileDark);
        top = base + hallH * 2.35;
      } else {
        top = building(big ? 0 : 1, cx, base, z, hallW, hallH, hallD, C.timber, C.tileDark, 0.6);
      }
      maxHeight = Math.max(maxHeight, top);
      // 左右の脇殿
      const sideW = Math.min(w * 0.12, 0.09);
      if (w > 0.5) {
        for (const dir of [-1, 1]) {
          building(2, cx + dir * w * 0.36, 0.006, z, sideW, hallH * 0.6, Math.min(slot * 0.7, 0.22), C.timber, C.tile, 0.6);
        }
      }
    }
  };
  for (const p of layout.palaces ?? []) compound(p);

  // ===== 角の小城(金墉城・子城) =====
  if (layout.citadel) {
    const cs = layout.citadel.size;
    const sx = layout.citadel.corner.includes("w") ? -1 : 1;
    const sz = layout.citadel.corner.includes("n") ? -1 : 1;
    const cx = sx * (hw - cs / 2);
    const cz = sz * (hd - cs / 2);
    reserved.push({ x0: cx - cs / 2 - 0.05, z0: cz - cs / 2 - 0.05, x1: cx + cs / 2 + 0.05, z1: cz + cs / 2 + 0.05 });
    const ch = wh * 1.2;
    // 城内側の2辺に壁を足して、四角く囲む
    add("wall", "body", 0, cx, 0, cz - sz * (cs / 2), cs, ch, wt * 0.85, 0, C.earthWall);
    add("wall", "body", 0, cx - sx * (cs / 2), 0, cz, cs, ch, wt * 0.85, Math.PI / 2, C.earthWall);
    const ix = cx - sx * (cs / 2);
    const iz = cz - sz * (cs / 2);
    add("box", "body", 0, ix, 0, iz, wt * 1.5, ch * 1.12, wt * 1.5, 0, C.earthWall);
    building(0, ix, ch * 1.12, iz, wt * 1.25, wh * 0.4, wt * 1.25, C.timber, C.tileDark, 0.75, true);
    // 中の高楼と建物
    add("box", "body", 0, cx, 0, cz, cs * 0.4, wh * 0.5, cs * 0.34, 0, C.stone);
    const top = tower(0, cx, wh * 0.5, cz, cs * 0.3, cs * 0.24, wh * 0.5, 2, C.timber, C.tileDark);
    maxHeight = Math.max(maxHeight, top);
    flag(0, cx, top - wh * 0.2, cz, wh * 0.8);
    for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      building(2, cx + ox * cs, 0, cz + oz * cs, cs * 0.16, wh * 0.3, cs * 0.1, pick(HOUSE_WALLS), C.tile);
    }
  }

  // ===== 高台(鄴の三台):西の城壁の北寄りに並ぶ =====
  if (layout.terraces) {
    const n = layout.terraces;
    const size = Math.min(0.24, (D * 0.55) / n - 0.06);
    for (let i = 0; i < n; i++) {
      const z = -hd + D * 0.12 + ((D * 0.55) / n) * (i + 0.5);
      const x = -hw + size * 0.55;
      const tall = wh * (i === Math.floor(n / 2) ? 2.3 : 1.9);
      reserved.push({ x0: x - size, z0: z - size * 0.8, x1: x + size, z1: z + size * 0.8 });
      add("box", "body", 0, x, 0, z, size * 1.2, tall * 0.55, size * 1.2, 0, C.earthWall);
      add("box", "body", 0, x, tall * 0.55, z, size, tall * 0.45, size, 0, C.earthWall);
      const top = tower(0, x, tall, z, size * 0.72, size * 0.56, wh * 0.55, 2, C.timber, C.tileDark);
      maxHeight = Math.max(maxHeight, top);
      if (i === Math.floor(n / 2)) flag(0, x, top - wh * 0.2, z, wh * 0.8);
    }
  }

  const blocked = (x: number, z: number, pad: number): boolean =>
    reserved.some((r) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) ||
    streetsX.some((sx) => Math.abs(x - sx) < streetW / 2 + pad) ||
    streetsZ.some((sz) => Math.abs(z - sz) < streetW / 2 + pad);
  const inner = wt / 2 + 0.05; // 城壁の内側のすき間

  // ===== 兵舎:長い建物を整列させる =====
  if (layout.barracks) {
    const n = layout.barracks;
    const rows = Math.ceil(n / 2);
    const bx = hw * 0.45;
    const bz = hd * 0.5;
    const bw = W * 0.2;
    const step = 0.085;
    reserved.push({ x0: bx - bw - 0.04, z0: bz - (rows * step) / 2 - 0.04, x1: bx + bw + 0.04, z1: bz + (rows * step) / 2 + 0.04 });
    add("box", "body", 1, bx, 0.004, bz, bw * 2 + 0.06, 0.003, rows * step + 0.06, 0, C.court);
    for (let i = 0; i < n; i++) {
      const z = bz + (Math.floor(i / 2) - (rows - 1) / 2) * step;
      const x = bx + (i % 2 === 0 ? -1 : 1) * bw * 0.52;
      building(1, x, 0.005, z, bw * 0.9, wh * 0.28, 0.045, C.wood, C.tile, 0.6);
    }
  }

  // ===== 主要施設:街の中の楼閣や大きな建物 =====
  for (let i = 0, tries = 0; i < layout.landmarks && tries < 200; tries++) {
    const x = (rand() - 0.5) * (W - inner * 4);
    const z = (rand() - 0.5) * (D - inner * 4);
    if (blocked(x, z, 0.1)) continue;
    reserved.push({ x0: x - 0.1, z0: z - 0.08, x1: x + 0.1, z1: z + 0.08 });
    add("box", "body", 1, x, 0, z, 0.17, 0.012, 0.13, 0, C.platform);
    const top = i % 2 === 0
      ? tower(1, x, 0.012, z, 0.1, 0.08, wh * 0.42, 2 + (layout.gateStoreys > 1 ? 1 : 0), C.timber, C.tile)
      : building(1, x, 0.012, z, 0.15, wh * 0.45, 0.085, C.timber, C.tile, 0.6);
    maxHeight = Math.max(maxHeight, top);
    i++;
  }

  // ===== 民家:城内を碁盤の目に区切って建てる =====
  const cellX = 0.105;
  const cellZ = 0.085;
  for (let z = -hd + inner + cellZ / 2; z < hd - inner; z += cellZ) {
    for (let x = -hw + inner + cellX / 2; x < hw - inner; x += cellX) {
      if (rand() > layout.density) continue;
      const hx = x + (rand() - 0.5) * 0.025;
      const hz = z + (rand() - 0.5) * 0.02;
      if (blocked(hx, hz, 0.035)) continue;
      const w = 0.055 + rand() * 0.03;
      const d = 0.034 + rand() * 0.016;
      const turned = rand() < 0.22;
      building(2, hx, 0, hz, turned ? d : w, 0.022 + rand() * 0.014, turned ? w : d,
        pick(HOUSE_WALLS), rand() < 0.15 ? C.thatch : pick(HOUSE_ROOFS));
    }
  }

  // ===== 城外の家:城門の前に広がる =====
  if (layout.suburbs) {
    const sides: Side[] = ["s", "e", "w", "n"];
    for (let i = 0; i < layout.suburbs; i++) {
      const s = sides[i % sides.length];
      const gates = gatePositions(s);
      if (gates.length === 0) continue;
      const g = pick(gates);
      const [x, z] = onSide(s, g + (rand() - 0.5) * 0.55, wt + 0.07 + rand() * 0.22);
      if (Math.abs((s === "n" || s === "s" ? x : z) - g) < streetW) continue;
      building(2, x, 0, z, 0.05 + rand() * 0.025, 0.02 + rand() * 0.01, 0.034 + rand() * 0.012,
        pick(HOUSE_WALLS), rand() < 0.6 ? C.thatch : pick(HOUSE_ROOFS));
    }
  }

  return { parts, radius: Math.hypot(hw, hd) + margin * 0.5 + (layout.suburbs ? 0.15 : 0), height: maxHeight };
}
