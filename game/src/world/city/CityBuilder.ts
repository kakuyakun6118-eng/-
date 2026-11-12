// 都市の設計図(CityLayout)から、城壁・城門・宮殿・坊(住宅区画)などの部品を並べる。
// ここでは「どの部品を、どこに、どの大きさで置くか」の一覧を作るだけで、描画はしない。
//
// 座標の決まり:都市の中心が原点。x は東、z は南、y は上。地面は y = 0。
import type { CityLayout, PalaceSpec } from "../../data/types";
import type { PartShape, PartSurface } from "./CityParts";

/**
 * 部品をいつ表示するか。
 * 0 = いつも / 1 = 中距離から / 2 = 近距離だけ / 3 = 遠いときだけ(近づくと細かい部品に置き換わる)
 * 4 = 都市を選択しているときだけ
 */
export type DetailTier = 0 | 1 | 2 | 3 | 4;

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
  /** 都市の半径(タップの当たり判定に使う) */
  radius: number;
  /** いちばん高い建物の高さ(都市名ラベルの位置に使う) */
  height: number;
  /** 城壁の外側までの、東西・南北の大きさ(選択時の光の枠に使う) */
  footprint: [number, number];
}

// --- 色。建物は土・木・瓦の自然な色にし、勢力の色は旗だけに使う ---
const C = {
  ground: "#8f8562",
  outline: "#5a4f3b",
  street: "#c4b48e",
  court: "#b6a988",
  earthWall: "#8a7654",
  gateWall: "#7d6b4d",
  parapet: "#b8a480",
  walkway: "#c9b78f",
  wardWall: "#a8946c",
  wardRoofs: "#77736a",
  stone: "#8d897f",
  platform: "#bdb7a9",
  doorway: "#241c18",
  timber: "#8c3b2a", // 朱塗りの柱や壁
  palaceWall: "#9a5140",
  wood: "#6f4a33",
  pole: "#3a2e26",
  tile: "#5c5f63",
  tileDark: "#3b3f43",
  thatch: "#8d7c52",
  water: "#3f6d84",
  bridge: "#7a6248",
  gold: "#e8c66a",
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
type WardKind = "houses" | "market" | "office" | "landmark";

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
  const storeys = layout.gateStoreys;
  const avenue = layout.avenueWidth ?? Math.max(0.045, gw * 0.45);
  let maxHeight = wh;

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
    count: number, wall: string, roof: string,
  ): number => {
    let top = y;
    const turn = d > w;
    const rot = turn ? Math.PI / 2 : 0;
    for (let i = 0; i < count; i++) {
      const k = 1 - 0.17 * i;
      const last = i === count - 1;
      const along = (turn ? d : w) * k;
      const across = (turn ? w : d) * k;
      add("box", "body", tier, x, top, z, along, storeyHeight, across, rot, wall);
      // 途中の階は低いひさし、最上階は高い屋根
      const rh = storeyHeight * (last ? 0.9 : 0.4);
      add("hip", "tile", tier, x, top + storeyHeight * (last ? 1 : 0.75), z, along * 1.4, rh, across * 1.6, rot, roof);
      top += storeyHeight * (last ? 1 : 0.95);
      if (last) top += rh;
    }
    maxHeight = Math.max(maxHeight, top);
    return top;
  };

  /** 旗:竿と、勢力の色の布 */
  const flag = (tier: DetailTier, x: number, y: number, z: number, size: number): void => {
    add("box", "body", tier, x, y, z, size * 0.07, size * 1.5, size * 0.07, 0, C.pole);
    add("box", "body", tier, x + size * 0.36, y + size * 0.85, z, size * 0.66, size * 0.6, size * 0.04, 0, flagColor);
  };

  /** 幟(のぼり):都市を選択したときだけ城門に立つ、縦長の旗 */
  const banner = (x: number, z: number, size: number): void => {
    add("box", "body", 4, x, 0, z, size * 0.06, size * 3.2, size * 0.06, 0, C.pole);
    add("box", "body", 4, x + size * 0.24, size * 1.7, z, size * 0.42, size * 1.4, size * 0.04, 0, flagColor);
    add("box", "body", 4, x, size * 3.2, z, size * 0.14, size * 0.14, size * 0.14, 0, C.gold);
  };

  // 四角い囲いの4辺。t は辺に沿った位置、out は外向きにずらす量
  interface Enclosure {
    cx: number;
    cz: number;
    w: number;
    d: number;
  }
  const sideLength = (e: Enclosure, s: Side): number => (s === "n" || s === "s" ? e.w : e.d);
  const sideRot = (s: Side): number => (s === "n" || s === "s" ? 0 : Math.PI / 2);
  const onSide = (e: Enclosure, s: Side, t: number, out: number): [number, number] => {
    if (s === "s") return [e.cx + t, e.cz + e.d / 2 + out];
    if (s === "n") return [e.cx + t, e.cz - e.d / 2 - out];
    if (s === "e") return [e.cx + e.w / 2 + out, e.cz + t];
    return [e.cx - e.w / 2 - out, e.cz + t];
  };
  const SIDES: Side[] = ["n", "s", "e", "w"];
  const city: Enclosure = { cx: 0, cz: 0, w: W, d: D };

  /** 辺の上に、城門を等間隔に並べたときの位置 */
  const gatePositions = (s: Side): number[] => {
    const n = layout.gates[s];
    const len = sideLength(city, s);
    return Array.from({ length: n }, (_, i) => ((i + 1) / (n + 1) - 0.5) * len);
  };

  /**
   * 城壁で四角く囲む。城壁は門の位置でも切らずに一周させ、
   * 門は城壁と一体の「城台」に暗い門道を開けて表す。
   */
  const rampart = (
    e: Enclosure, height: number, thick: number, tier: DetailTier,
    gates: Record<Side, number[]>, gateWidth: number, gateStoreys: number, opts: {
      grandSouth?: boolean; wallTowers?: number; cornerTowers?: boolean; outer?: boolean;
    },
  ): void => {
    for (const s of SIDES) {
      const len = sideLength(e, s);
      const rot = sideRot(s);
      const [wx, wz] = onSide(e, s, 0, 0);
      // 城壁の本体(角で重なるよう、少し長めにする)
      add("wall", "body", tier, wx, 0, wz, len + thick, height, thick, rot, C.earthWall);
      // 城壁の上の通路。明るい色にして、上空から壁の厚みが分かるようにする
      add("box", "body", tier, wx, height, wz, len + thick * 0.7, height * 0.03, thick * 0.62, rot, C.walkway);
      // 胸壁:城壁の上の、外側と内側の縁
      for (const o of [0.3, -0.3]) {
        const [px, pz] = onSide(e, s, 0, thick * o);
        add("box", "body", 1, px, height, pz, len + thick * 0.6, height * 0.1, thick * 0.1, rot, C.parapet);
      }
      if (opts.outer) {
        // 女墻(じょしょう):胸壁の上の凸凹
        for (let t = -len / 2 + 0.03; t < len / 2; t += 0.075) {
          const [mx, mz] = onSide(e, s, t, thick * 0.3);
          add("box", "body", 2, mx, height * 1.1, mz, 0.038, height * 0.09, thick * 0.1, rot, C.parapet);
        }
        // 城壁の外側の足もとを濃くして、上空から輪郭がはっきり見えるようにする
        const [ox, oz] = onSide(e, s, 0, thick * 0.85);
        add("box", "body", 0, ox, 0.001, oz, len + thick * 2.6, 0.003, thick * 0.7, rot, C.outline);
      }

      gates[s].forEach((g, gi) => {
        const grand = !!opts.grandSouth && s === "s" && gi === Math.floor(gates[s].length / 2);
        const k = grand ? 1.45 : 1;
        const [x, z] = onSide(e, s, g, 0);
        // 城台:城壁より少し高く厚い、門の土台
        add("box", "body", tier, x, 0, z, gateWidth * 1.5 * k, height * 1.12, thick * 1.4, rot, C.gateWall);
        // 門道:正門は3つ、ほかは1つ
        const doors = grand ? 3 : 1;
        for (let i = 0; i < doors; i++) {
          const [dx, dz] = onSide(e, s, g + (i - (doors - 1) / 2) * gateWidth * 0.44 * k, 0);
          add("box", "body", tier, dx, 0, dz, gateWidth * (doors === 1 ? 0.42 : 0.27) * k, height * 0.72, thick * 1.46, rot, C.doorway);
        }
        // 門楼:城台の上の楼閣
        const along = gateWidth * 1.3 * k;
        const across = thick * 1.05;
        const top = tower(
          tier, x, height * 1.12, z, rot === 0 ? along : across, rot === 0 ? across : along,
          height * 0.44 * (grand ? 1.15 : 1), gateStoreys + (grand ? 1 : 0), C.timber, C.tileDark,
        );
        if (opts.outer) {
          flag(0, x, top - height * 0.2, z, height * 0.85 * k);
          // 門から城外へ伸びる道
          const [rx, rz] = onSide(e, s, g, thick / 2 + 0.2);
          add("box", "body", 1, rx, 0.002, rz, avenue * (grand ? 1.6 : 1), 0.003, 0.4, rot, C.street);
          for (const dir of [-1, 1]) {
            const [bx, bz] = onSide(e, s, g + dir * gateWidth * 0.95 * k, thick * 1.2);
            banner(bx, bz, height * 0.75 * k);
          }
        }
        if (grand) {
          // 正門の左右に立つ「闕(けつ)」
          for (const dir of [-1, 1]) {
            const [qx, qz] = onSide(e, s, g + dir * gateWidth * 1.4, thick * 1.7);
            add("box", "body", tier, qx, 0, qz, gateWidth * 0.42, height * 1.45, gateWidth * 0.42, 0, C.gateWall);
            building(tier, qx, height * 1.45, qz, gateWidth * 0.4, height * 0.36, gateWidth * 0.4, C.timber, C.tileDark, 0.8, true);
          }
        }
      });

      // 望楼:城壁から外へ張り出す馬面と、その上の小屋
      const n = opts.wallTowers ?? 0;
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n - 0.5) * len;
        if (gates[s].some((g) => Math.abs(g - t) < gateWidth * 1.3)) continue;
        const [x, z] = onSide(e, s, t, thick * 0.45);
        add("box", "body", 1, x, 0, z, thick * 1.3, height * 1.06, thick * 1.5, rot, C.earthWall);
        if (gateStoreys >= 2 || n >= 3) {
          const top = building(1, x, height * 1.06, z, thick, height * 0.3, thick, C.wood, C.tile, 0.7, true);
          maxHeight = Math.max(maxHeight, top);
        }
      }
    }

    // 角楼
    if (opts.cornerTowers) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = e.cx + (sx * e.w) / 2;
        const cz = e.cz + (sz * e.d) / 2;
        add("box", "body", tier, cx, 0, cz, thick * 1.8, height * 1.16, thick * 1.8, 0, C.gateWall);
        const top = tower(tier, cx, height * 1.16, cz, thick * 1.5, thick * 1.5, height * 0.4, gateStoreys >= 2 ? 2 : 1, C.timber, C.tileDark);
        if (opts.outer && gateStoreys >= 2) flag(1, cx, top - height * 0.15, cz, height * 0.6);
      }
    }
  };

  // ===== 地面・濠 =====
  const moatWidth = layout.moat ? 0.13 : 0;
  const moatGap = layout.moat ? 0.09 : 0;
  const margin = moatGap + moatWidth;
  // 城内の地面。城壁の外にはみ出させず、台座のように見えないようにする
  add("box", "body", 0, 0, -0.3, 0, W + wt * 0.6, 0.3, D + wt * 0.6, 0, C.ground);
  if (layout.moat) {
    const r = moatGap + wt / 2 + moatWidth / 2;
    add("box", "water", 0, 0, 0.002, hd + r, W + r * 2 + moatWidth, 0.004, moatWidth, 0, C.water);
    add("box", "water", 0, 0, 0.002, -hd - r, W + r * 2 + moatWidth, 0.004, moatWidth, 0, C.water);
    add("box", "water", 0, hw + r, 0.002, 0, moatWidth, 0.004, D + r * 2 + moatWidth, 0, C.water);
    add("box", "water", 0, -hw - r, 0.002, 0, moatWidth, 0.004, D + r * 2 + moatWidth, 0, C.water);
    for (const s of SIDES) {
      for (const g of gatePositions(s)) {
        const [bx, bz] = onSide(city, s, g, r);
        add("box", "body", 0, bx, 0.004, bz, gw * 0.5, 0.012, moatWidth * 1.3, sideRot(s), C.bridge);
      }
    }
  }

  // ===== 外城の城壁 =====
  const cityGates: Record<Side, number[]> = { n: gatePositions("n"), s: gatePositions("s"), e: gatePositions("e"), w: gatePositions("w") };
  rampart(city, wh, wt, 0, cityGates, gw, storeys, {
    grandSouth: layout.grandGate, wallTowers: layout.wallTowers, cornerTowers: layout.cornerTowers, outer: true,
  });

  // ===== 大通り(城門から城内へ伸びる) =====
  const uniq = (list: number[]): number[] => [...new Set(list.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const streetsX = uniq([...cityGates.n, ...cityGates.s]);
  const streetsZ = uniq([...cityGates.e, ...cityGates.w]);
  // 正門から伸びる中央の大通りは、特に広くする
  const widthX = (x: number): number => (layout.grandGate && Math.abs(x) < 0.02 ? avenue * 1.7 : avenue);
  for (const x of streetsX) add("box", "body", 0, x, 0.002, 0, widthX(x), 0.003, D - wt, 0, C.street);
  for (const z of streetsZ) add("box", "body", 0, 0, 0.002, z, W - wt, 0.003, avenue, 0, C.street);

  const reserved: Rect[] = []; // 坊を作らない場所
  const reserve = (cx: number, cz: number, w: number, d: number, pad = 0.03): void => {
    reserved.push({ x0: cx - w / 2 - pad, z0: cz - d / 2 - pad, x1: cx + w / 2 + pad, z1: cz + d / 2 + pad });
  };

  // ===== 宮殿・役所:塀や城壁で囲まれ、中心線に殿舎が並ぶ =====
  const compound = (cx: number, cz: number, w: number, d: number, halls: number, grade: 1 | 2, fortified: boolean): void => {
    const palace = grade === 2;
    const far: DetailTier = palace || fortified ? 0 : 1;
    reserve(cx, cz, w, d, fortified ? wt * 0.5 : 0.02);
    add("box", "body", far, cx, 0.004, cz, w, 0.004, d, 0, C.court);

    const e: Enclosure = { cx, cz, w, d };
    if (fortified) {
      // 内城・宮城:角楼と四方の門を持つ城壁で囲む
      const gateW = Math.min(gw * 0.8, w * 0.16);
      rampart(e, wh * 0.82, wt * 0.62, 0, { n: [0], s: [0], e: [0], w: [0] }, gateW, Math.max(1, storeys - 1), {
        cornerTowers: true, wallTowers: palace ? 2 : 0,
      });
    } else {
      // 瓦をのせた赤土の塀。南に門を開ける
      const fh = wh * (palace ? 0.55 : 0.4);
      const ft = wt * 0.26;
      const fence = (s: Side, t: number, len: number): void => {
        const [x, z] = onSide(e, s, t, 0);
        add("box", "body", far, x, 0, z, len, fh, ft, sideRot(s), C.palaceWall);
        add("hip", "tile", 1, x, fh, z, len, fh * 0.3, ft * 2.4, sideRot(s), C.tileDark);
      };
      const gap = w * 0.18;
      fence("n", 0, w);
      fence("e", 0, d);
      fence("w", 0, d);
      fence("s", -(w + gap) / 4, (w - gap) / 2);
      fence("s", (w + gap) / 4, (w - gap) / 2);
      building(1, cx, 0, cz + d / 2, gap * 0.95, fh * 1.1, ft * 3.5, C.timber, C.tileDark, 0.9);
    }

    // 中心線に殿舎を南から北へ並べる。2番目(1棟だけなら1番目)を正殿として大きくする
    const inset = fortified ? wt * 0.9 : 0.03;
    const iw = w - inset * 2;
    const id = d - inset * 2;
    const n = Math.max(1, halls);
    const main = n > 1 ? 1 : 0;
    const slot = id / n;
    for (let i = 0; i < n; i++) {
      const z = cz + id / 2 - slot * (i + 0.5);
      const big = i === main;
      const hallW = Math.min(iw * (big ? 0.46 : 0.32), big ? 0.62 : 0.4);
      const hallD = Math.min(slot * (big ? 0.6 : 0.46), hallW * 0.55);
      const hallH = hallD * (palace ? 0.5 : 0.42);
      const tier: DetailTier = big ? far : 1;
      let base = 0.006;
      if (palace) {
        // 基壇:正殿は3段、ほかは1段の石の土台
        const steps = big ? 3 : 1;
        for (let k = 0; k < steps; k++) {
          const grow = 1 + (steps - k) * 0.16;
          add("box", "body", tier, cx, base, z, hallW * grow * 1.12, 0.014, hallD * grow * 1.3, 0, C.platform);
          base += 0.014;
        }
      }
      let top: number;
      if (palace && big) {
        // 正殿は屋根を二重にする(重檐)
        add("box", "body", 0, cx, base, z, hallW, hallH, hallD, 0, C.timber);
        add("hip", "tile", 0, cx, base + hallH * 0.8, z, hallW * 1.36, hallH * 0.42, hallD * 1.75, 0, C.tileDark);
        add("box", "body", 0, cx, base + hallH, z, hallW * 0.74, hallH * 0.5, hallD * 0.7, 0, C.timber);
        add("hip", "tile", 0, cx, base + hallH * 1.5, z, hallW * 1.02, hallH * 0.85, hallD * 1.22, 0, C.tileDark);
        top = base + hallH * 2.35;
      } else {
        top = building(tier, cx, base, z, hallW, hallH, hallD, C.timber, C.tileDark, 0.6);
      }
      maxHeight = Math.max(maxHeight, top);

      if (iw > 0.45) {
        // 回廊:中庭の東西を囲む、南北に長い建物
        for (const dir of [-1, 1]) {
          building(2, cx + dir * iw * 0.3, 0.006, z, 0.03, hallH * 0.4, slot * 0.86, C.timber, C.tile, 0.7);
        }
      }
      if (iw > 0.8) {
        // 東西の脇殿
        for (const dir of [-1, 1]) {
          building(1, cx + dir * iw * 0.41, 0.006, z, iw * 0.13, hallH * 0.62, Math.min(slot * 0.5, 0.14), C.timber, C.tileDark, 0.6);
        }
      } else if (!palace) {
        for (const dir of [-1, 1]) {
          building(2, cx + dir * iw * 0.36, 0.006, z, iw * 0.16, hallH * 0.6, Math.min(slot * 0.55, 0.1), C.wood, C.tile, 0.6);
        }
      }
    }
    if (palace && iw > 0.8) {
      // 宮城の四隅の楼閣と、北東の庭園の池
      for (const [sx, sz] of [[-1, 1], [1, 1]]) {
        tower(1, cx + sx * iw * 0.42, 0.006, cz + sz * id * 0.42, 0.07, 0.07, wh * 0.36, 2, C.timber, C.tileDark);
      }
      add("box", "water", 1, cx + iw * 0.41, 0.006, cz - id * 0.4, iw * 0.13, 0.004, id * 0.12, 0, C.water);
      building(2, cx + iw * 0.41, 0.008, cz - id * 0.4, 0.04, 0.03, 0.04, C.timber, C.tileDark, 0.9, true);
    }
  };
  for (const p of layout.palaces ?? []) {
    const spec: PalaceSpec = p;
    compound(spec.center[0] * W, spec.center[1] * D, spec.size[0] * W, spec.size[1] * D, spec.halls, spec.grade, !!spec.fortified);
  }

  // ===== 宮殿のない都市の中心:象徴となる建物 =====
  if (!layout.palaces?.length && layout.centerpiece) {
    const size = Math.min(W, D) * 0.2;
    reserve(0, 0, size, size, 0.02);
    add("box", "body", 0, 0, 0.004, 0, size, 0.02, size, 0, C.platform);
    if (layout.centerpiece === "tower") tower(0, 0, 0.024, 0, size * 0.55, size * 0.45, wh * 0.5, 2, C.timber, C.tileDark);
    else maxHeight = Math.max(maxHeight, building(0, 0, 0.024, 0, size * 0.7, wh * 0.5, size * 0.4, C.timber, C.tileDark, 0.6));
  }

  // ===== 角の小城(金墉城・子城) =====
  if (layout.citadel) {
    const cs = layout.citadel.size;
    const sx = layout.citadel.corner.includes("w") ? -1 : 1;
    const sz = layout.citadel.corner.includes("n") ? -1 : 1;
    const cx = sx * (hw - cs / 2);
    const cz = sz * (hd - cs / 2);
    reserve(cx, cz, cs, cs, wt * 0.6);
    const ch = wh * 1.2;
    // 城内側の2辺に壁を足して、四角く囲む
    add("wall", "body", 0, cx, 0, cz - sz * (cs / 2), cs, ch, wt * 0.85, 0, C.earthWall);
    add("wall", "body", 0, cx - sx * (cs / 2), 0, cz, cs, ch, wt * 0.85, Math.PI / 2, C.earthWall);
    const ix = cx - sx * (cs / 2);
    const iz = cz - sz * (cs / 2);
    add("box", "body", 0, ix, 0, iz, wt * 1.5, ch * 1.12, wt * 1.5, 0, C.gateWall);
    building(0, ix, ch * 1.12, iz, wt * 1.25, wh * 0.4, wt * 1.25, C.timber, C.tileDark, 0.75, true);
    // 中の高楼と建物
    add("box", "body", 0, cx, 0, cz, cs * 0.4, wh * 0.5, cs * 0.34, 0, C.stone);
    const top = tower(0, cx, wh * 0.5, cz, cs * 0.3, cs * 0.24, wh * 0.5, 2, C.timber, C.tileDark);
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
      const x = -hw + size * 0.6 + wt * 0.5;
      const tall = wh * (i === Math.floor(n / 2) ? 2.3 : 1.9);
      reserve(x, z, size * 1.3, size * 1.3);
      add("box", "body", 0, x, 0, z, size * 1.2, tall * 0.55, size * 1.2, 0, C.earthWall);
      add("box", "body", 0, x, tall * 0.55, z, size, tall * 0.45, size, 0, C.earthWall);
      const top = tower(0, x, tall, z, size * 0.72, size * 0.56, wh * 0.55, 2, C.timber, C.tileDark);
      if (i === Math.floor(n / 2)) flag(0, x, top - wh * 0.2, z, wh * 0.8);
    }
  }

  // ===== 兵舎:長い建物を整列させる =====
  if (layout.barracks) {
    const n = layout.barracks;
    const rows = Math.ceil(n / 2);
    const bx = hw * 0.45;
    const bz = hd * 0.5;
    const bw = W * 0.2;
    const step = 0.085;
    reserve(bx, bz, bw * 2 + 0.06, rows * step + 0.06);
    add("box", "body", 1, bx, 0.004, bz, bw * 2 + 0.06, 0.003, rows * step + 0.06, 0, C.court);
    for (let i = 0; i < n; i++) {
      const z = bz + (Math.floor(i / 2) - (rows - 1) / 2) * step;
      const x = bx + (i % 2 === 0 ? -1 : 1) * bw * 0.52;
      building(1, x, 0.005, z, bw * 0.9, wh * 0.28, 0.045, C.wood, C.tile, 0.6);
    }
  }

  // ===== 城内を「坊」(塀で囲まれた区画)に分ける =====
  const lane = 0.028; // 坊と坊のあいだの小路
  const inset = wt / 2 + 0.05; // 城壁の内側を一周する道
  const target = layout.wardSize ?? 0.38;
  // 大通りで区切られた範囲を、さらに坊の大きさに割る
  const cutsX = [-hw + inset, ...streetsX.flatMap((x) => [x - widthX(x) / 2, x + widthX(x) / 2]), hw - inset];
  const cutsZ = [-hd + inset, ...streetsZ.flatMap((z) => [z - avenue / 2, z + avenue / 2]), hd - inset];
  const wards: { rect: Rect; kind: WardKind }[] = [];
  for (let i = 0; i < cutsX.length; i += 2) {
    for (let j = 0; j < cutsZ.length; j += 2) {
      const bw = cutsX[i + 1] - cutsX[i];
      const bd = cutsZ[j + 1] - cutsZ[j];
      if (bw < 0.12 || bd < 0.12) continue;
      const nx = Math.max(1, Math.round(bw / target));
      const nz = Math.max(1, Math.round(bd / target));
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          const rect: Rect = {
            x0: cutsX[i] + (bw / nx) * a + lane / 2,
            x1: cutsX[i] + (bw / nx) * (a + 1) - lane / 2,
            z0: cutsZ[j] + (bd / nz) * b + lane / 2,
            z1: cutsZ[j] + (bd / nz) * (b + 1) - lane / 2,
          };
          const hit = reserved.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.z0 < r.z1 && rect.z1 > r.z0);
          if (!hit) wards.push({ rect, kind: "houses" });
        }
      }
    }
  }

  /** 指定した場所にいちばん近い、まだ普通の住宅区画である坊を、別の用途に変える */
  const assign = (x: number, z: number, kind: WardKind): void => {
    let best: (typeof wards)[number] | null = null;
    let bestD = Infinity;
    for (const w of wards) {
      if (w.kind !== "houses") continue;
      const d = Math.hypot((w.rect.x0 + w.rect.x1) / 2 - x, (w.rect.z0 + w.rect.z1) / 2 - z);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (best) best.kind = kind;
  };
  // 役所は宮殿の南、中央の大通りの両側に並べる(官庁街)
  const firstPalace = layout.palaces?.[0];
  const officeZ = firstPalace ? (firstPalace.center[1] + firstPalace.size[1] / 2) * D + target * 0.7 : target * 0.6;
  for (let i = 0; i < (layout.offices ?? 0); i++) {
    assign((i % 2 === 0 ? -1 : 1) * target * 0.7, officeZ + Math.floor(i / 2) * target, "office");
  }
  // 市場は東西に分けて置く(東市・西市)
  for (let i = 0; i < (layout.markets ?? 0); i++) {
    assign((i % 2 === 0 ? 1 : -1) * W * 0.3, D * (0.22 - 0.3 * Math.floor(i / 2)), "market");
  }
  for (let i = 0; i < layout.landmarks; i++) {
    assign((rand() - 0.5) * W * 0.8, (rand() - 0.5) * D * 0.8, "landmark");
  }

  for (const { rect, kind } of wards) {
    const w = rect.x1 - rect.x0;
    const d = rect.z1 - rect.z0;
    const cx = (rect.x0 + rect.x1) / 2;
    const cz = (rect.z0 + rect.z1) / 2;

    if (kind === "office") {
      compound(cx, cz, w * 0.94, d * 0.94, d > 0.3 ? 2 : 1, 1, false);
      continue;
    }

    // 坊の塀
    const fenceH = 0.022;
    add("box", "body", 1, cx, 0, rect.z0, w, fenceH, 0.01, 0, C.wardWall);
    add("box", "body", 1, cx, 0, rect.z1, w, fenceH, 0.01, 0, C.wardWall);
    add("box", "body", 1, rect.x0, 0, cz, 0.01, fenceH, d, 0, C.wardWall);
    add("box", "body", 1, rect.x1, 0, cz, 0.01, fenceH, d, 0, C.wardWall);

    if (kind === "market") {
      // 市場:広場に露店の列が並び、中央に市楼が立つ
      add("box", "body", 0, cx, 0.003, cz, w, 0.003, d, 0, C.court);
      tower(1, cx, 0.004, cz, 0.07, 0.06, wh * 0.36, 2, C.timber, C.tile);
      const rows = Math.max(2, Math.floor(d / 0.07));
      for (let r = 0; r < rows; r++) {
        const z = rect.z0 + (d / rows) * (r + 0.5);
        if (Math.abs(z - cz) < 0.05) continue;
        for (const dir of [-1, 1]) {
          building(2, cx + dir * w * 0.25, 0.004, z, w * 0.36, 0.016, 0.026, C.wood, rand() < 0.5 ? C.thatch : C.tile, 0.5);
        }
      }
      continue;
    }

    // 遠くから見たとき用:坊ひとつを、屋根の色の面で表す
    add("box", "body", 3, cx, 0, cz, w * 0.94, 0.03, d * 0.94, 0, C.wardRoofs);

    if (kind === "landmark") {
      add("box", "body", 1, cx, 0.003, cz, 0.15, 0.012, 0.12, 0, C.platform);
      tower(1, cx, 0.015, cz, 0.095, 0.075, wh * 0.4, storeys >= 2 ? 3 : 2, C.timber, C.tile);
    }

    // 民家:東西に並ぶ列を、南北に何列か
    const rowStep = 0.06;
    const rows = Math.max(1, Math.floor((d - 0.03) / rowStep));
    for (let r = 0; r < rows; r++) {
      const z = rect.z0 + 0.015 + (d - 0.03) * ((r + 0.5) / rows);
      let x = rect.x0 + 0.02;
      while (x < rect.x1 - 0.05) {
        const hwid = 0.05 + rand() * 0.035;
        const hx = x + hwid / 2;
        x += hwid + 0.008 + rand() * 0.01;
        if (hx + hwid / 2 > rect.x1 - 0.012) break;
        if (rand() > layout.density) continue;
        if (kind === "landmark" && Math.abs(hx - cx) < 0.11 && Math.abs(z - cz) < 0.09) continue;
        const rich = rand() < 0.07;
        building(2, hx, 0, z, hwid, (rich ? 0.04 : 0.022) + rand() * 0.012, 0.034 + rand() * 0.012,
          rich ? C.timber : pick(HOUSE_WALLS), rand() < 0.12 ? C.thatch : pick(HOUSE_ROOFS));
      }
    }
  }

  // ===== 城外の家:城門の前に広がる =====
  if (layout.suburbs) {
    for (let i = 0; i < layout.suburbs; i++) {
      const s = SIDES[i % SIDES.length];
      const gates = cityGates[s];
      if (gates.length === 0) continue;
      const g = pick(gates);
      const offset = (rand() - 0.5) * 0.6;
      if (Math.abs(offset) < avenue) continue;
      const [x, z] = onSide(city, s, g + offset, wt * 1.3 + 0.05 + rand() * 0.24);
      building(2, x, 0, z, 0.05 + rand() * 0.025, 0.02 + rand() * 0.01, 0.034 + rand() * 0.012,
        pick(HOUSE_WALLS), rand() < 0.6 ? C.thatch : pick(HOUSE_ROOFS));
    }
  }

  return {
    parts,
    radius: Math.hypot(hw, hd) + margin * 0.5,
    height: maxHeight,
    footprint: [W + wt * 1.5 + margin * 2, D + wt * 1.5 + margin * 2],
  };
}
