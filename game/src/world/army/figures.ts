// 兵士・騎馬・旗・荷車など、軍団を形づくる「人形」の部品。行軍の陣形と野営の両方で使う。
import type { DetailTier, Part } from "../parts/instancing";

// 鎧・馬・武器は自然な色にし、勢力の色は旗・衣・鞍掛けに使う
export const C = {
  armour: "#4f4338",
  helmet: "#35302b",
  cloth: "#b8a682",
  wood: "#6a4a30",
  pole: "#32281f",
  gold: "#e8c66a",
  wagon: "#7a5c3c",
  cover: "#c2b48e",
  ox: "#5d4632",
  drum: "#8c3b2a",
  tent: "#cdc2a2",
  tentDark: "#b3a684",
  fence: "#5d4a36",
  ember: "#e07a2a",
  ash: "#2b2520",
};
const HORSES = ["#6b4a32", "#4a3526", "#8a6a48", "#2f2924", "#a8977c"];

/** 人形の数:兵力の平方根に比例させる(1,000人で約40体、34,000人で約240体) */
export function figureCount(troops: number): number {
  return troops > 0 ? Math.max(3, Math.round(1.3 * Math.sqrt(troops))) : 0;
}

/** 色を暗く(または明るく)する */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

export type FigureKit = ReturnType<typeof createFigureKit>;

/**
 * 人形を置くための道具一式を作る。置いた部品は parts にたまっていく。
 * ground は、中心から見た位置 (x, z) の地面が、中心よりどれだけ高いかを返す関数。
 */
export function createFigureKit(parts: Part[], seedText: string, color: string, ground: (x: number, z: number) => number) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  /** 毎回同じ並びになる乱数 */
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const add = (
    tier: DetailTier, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: string,
    shape: Part["shape"] = "box",
  ): void => {
    parts.push({ shape, surface: shape === "box" ? "body" : "tile", tier, x, y, z, sx, sy, sz, rot: 0, color: col });
  };
  const tunic = shade(color, 0.85);

  const infantry = (x: number, z: number): void => {
    const y = ground(x, z);
    add(2, x, y, z, 0.02, 0.028, 0.014, tunic); // 衣(勢力の色)
    add(2, x, y + 0.028, z, 0.024, 0.024, 0.016, C.armour); // 鎧
    add(2, x, y + 0.052, z, 0.014, 0.014, 0.014, C.helmet); // 兜
    add(2, x + 0.015, y + 0.006, z, 0.004, 0.1, 0.004, C.wood); // 矛
    add(2, x - 0.012, y + 0.022, z - 0.009, 0.016, 0.026, 0.004, color); // 盾(勢力の色)
  };
  const archer = (x: number, z: number): void => {
    const y = ground(x, z);
    add(2, x, y, z, 0.018, 0.028, 0.012, tunic);
    add(2, x, y + 0.028, z, 0.02, 0.022, 0.013, C.cloth); // 軽装
    add(2, x, y + 0.05, z, 0.013, 0.013, 0.013, C.helmet);
    add(2, x + 0.013, y + 0.016, z - 0.006, 0.003, 0.05, 0.003, C.wood); // 弓
  };
  /** 馬(withRider が false なら、つないである馬だけ)。足もとの高さを返す */
  const rider = (x: number, z: number, k = 1, withRider = true): number => {
    const y = ground(x, z);
    const horse = HORSES[Math.floor(rand() * HORSES.length)];
    add(2, x, y + 0.026 * k, z, 0.024 * k, 0.026 * k, 0.07 * k, horse); // 胴
    add(2, x, y + 0.04 * k, z - 0.042 * k, 0.014 * k, 0.03 * k, 0.022 * k, horse); // 首と頭
    add(2, x, y, z - 0.022 * k, 0.02 * k, 0.028 * k, 0.008 * k, shade(horse, 0.7)); // 前脚
    add(2, x, y, z + 0.024 * k, 0.02 * k, 0.028 * k, 0.008 * k, shade(horse, 0.7)); // 後脚
    add(2, x, y + 0.05 * k, z + 0.004 * k, 0.028 * k, 0.006 * k, 0.036 * k, color); // 鞍掛け(勢力の色)
    if (withRider) {
      add(2, x, y + 0.056 * k, z, 0.02 * k, 0.03 * k, 0.016 * k, C.armour);
      add(2, x, y + 0.086 * k, z, 0.013 * k, 0.013 * k, 0.013 * k, C.helmet);
    }
    return y;
  };
  const cavalry = (x: number, z: number): void => {
    const y = rider(x, z);
    add(2, x + 0.016, y + 0.04, z - 0.01, 0.004, 0.12, 0.004, C.wood); // 槍
  };
  /** 旗:竿と、勢力の色の布。遠くからでも見えるよう、いつも表示する */
  const flag = (x: number, z: number, h: number, w: number): void => {
    const y = ground(x, z);
    add(0, x, y, z, h * 0.035, h, h * 0.035, C.pole);
    add(0, x + w * 0.55, y + h * 0.58, z, w, h * 0.38, h * 0.025, color);
  };
  /** 軍団旗:指揮官のそばに立つ、いちばん大きな旗 */
  const banner = (x: number, z: number, h: number): void => {
    const y = ground(x, z);
    const k = h / 0.34;
    add(0, x, y, z, 0.012 * k, h, 0.012 * k, C.pole);
    add(0, x + 0.075 * k, y + h * 0.5, z, 0.14 * k, h * 0.46, 0.01, color);
    add(0, x, y + h, z, 0.026 * k, 0.026 * k, 0.026 * k, C.gold);
  };
  const wagon = (x: number, z: number, withOx = true): void => {
    const y = ground(x, z);
    add(2, x, y + 0.012, z, 0.04, 0.016, 0.06, C.wagon); // 荷台
    add(2, x, y + 0.028, z, 0.042, 0.02, 0.058, C.cover, "hip"); // 幌
    add(2, x - 0.022, y, z, 0.005, 0.026, 0.026, C.pole); // 車輪
    add(2, x + 0.022, y, z, 0.005, 0.026, 0.026, C.pole);
    if (withOx) add(2, x, y + 0.004, z - 0.058, 0.022, 0.026, 0.044, C.ox); // 牛
  };

  return { add, rand, infantry, archer, rider, cavalry, flag, banner, wagon };
}
