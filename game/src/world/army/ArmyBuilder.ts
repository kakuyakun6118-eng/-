// 軍団のデータから、兵士・騎馬・旗・荷車などの部品を並べる。
// 兵士を全員描くのではなく、兵力の平方根に比例した数の「人形」で規模を表す。
//
// 座標の決まり:軍団の中心が原点。-z が前(進行方向)、x が右、y が上。
import type { Army } from "../../data/types";
import type { Part } from "../parts/instancing";
import { C, createFigureKit, figureCount, shade } from "./figures";

export interface ArmyBlueprint {
  parts: Part[];
  /** 軍団の半径(タップの当たり判定に使う) */
  radius: number;
  /** 軍旗の先までの高さ(ラベルの位置に使う) */
  height: number;
}

/**
 * ground は、軍団の中心から見た位置 (x, z) の地面が、中心よりどれだけ高いかを返す関数。
 * 兵士を1体ずつ、足もとの地形に合わせて立たせるために使う。
 */
export function buildArmy(army: Army, color: string, ground: (x: number, z: number) => number): ArmyBlueprint {
  const parts: Part[] = [];
  const kit = createFigureKit(parts, army.id, color, ground);
  const { add, rand, infantry, archer, rider, cavalry, flag, wagon } = kit;

  /**
   * 兵士の方陣を1つ置く。遠いとき用に、同じ場所へ勢力の色の板も置く。
   * 戻り値は、その隊の奥行き。
   */
  const block = (
    cx: number, zFront: number, count: number, perRow: number, gapX: number, gapZ: number,
    place: (x: number, z: number) => void, slab: string, withFlag: boolean,
  ): number => {
    const rows = Math.ceil(count / perRow);
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / perRow);
      const inRow = Math.min(perRow, count - r * perRow);
      const c = i % perRow;
      place(cx + (c - (inRow - 1) / 2) * gapX + (rand() - 0.5) * gapX * 0.18, zFront + r * gapZ + (rand() - 0.5) * gapZ * 0.18);
    }
    const w = Math.min(count, perRow) * gapX;
    const d = rows * gapZ;
    const mz = zFront + d / 2 - gapZ / 2;
    add(3, cx, ground(cx, mz), mz, w, 0.035, d, slab);
    if (withFlag) flag(cx - w / 2 - 0.012, zFront, 0.2, 0.06);
    return d;
  };

  const nInf = figureCount(army.troops.infantry);
  const nCav = figureCount(army.troops.cavalry);
  const nArc = figureCount(army.troops.archer);
  let z = 0; // 前から後ろへ、順に並べていく
  let halfWidth = 0.1;

  // ----- 前列:弓兵 -----
  if (nArc > 0) {
    const perRow = Math.min(nArc, Math.max(8, Math.ceil(Math.sqrt(nArc * 4))));
    z += block(0, z, nArc, perRow, 0.045, 0.05, archer, shade(color, 1.15), nArc >= 12) + 0.05;
    halfWidth = Math.max(halfWidth, (perRow * 0.045) / 2);
  }

  // ----- 中央:歩兵の方陣(5列×5人を1隊として、横に並べる) -----
  let infDepth = 0;
  let infHalf = 0;
  if (nInf > 0) {
    const size = 25;
    const blocks = Math.ceil(nInf / size);
    const perLine = Math.min(blocks, blocks > 6 ? Math.ceil(blocks / 2) : blocks);
    const lines = Math.ceil(blocks / perLine);
    const bw = 5 * 0.042 + 0.05;
    const bd = 5 * 0.046 + 0.05;
    let left = nInf;
    for (let b = 0; b < blocks; b++) {
      const line = Math.floor(b / perLine);
      const inLine = Math.min(perLine, blocks - line * perLine);
      const col = b % perLine;
      const n = Math.min(size, left);
      left -= n;
      block((col - (inLine - 1) / 2) * bw, z + line * bd, n, 5, 0.042, 0.046, infantry, shade(color, 0.8), true);
    }
    infHalf = (perLine * bw) / 2;
    infDepth = lines * bd;
    halfWidth = Math.max(halfWidth, infHalf);
  }

  // ----- 両翼:騎兵(歩兵がいなければ中央に並べる) -----
  let cavDepth = 0;
  if (nCav > 0) {
    if (nInf > 0) {
      const perRow = Math.max(3, Math.min(6, Math.ceil(Math.sqrt(nCav / 2))));
      const half = Math.ceil(nCav / 2);
      const wingX = infHalf + 0.06 + (perRow * 0.06) / 2;
      cavDepth = block(-wingX, z, half, perRow, 0.06, 0.1, cavalry, shade(color, 1.0), true);
      block(wingX, z, nCav - half, perRow, 0.06, 0.1, cavalry, shade(color, 1.0), true);
      halfWidth = Math.max(halfWidth, wingX + (perRow * 0.06) / 2);
    } else {
      const perRow = Math.max(4, Math.ceil(Math.sqrt(nCav * 2.5)));
      cavDepth = block(0, z, nCav, perRow, 0.06, 0.1, cavalry, shade(color, 1.0), true);
      halfWidth = Math.max(halfWidth, (perRow * 0.06) / 2);
    }
  }
  z += Math.max(infDepth, cavDepth) + 0.05;

  // ----- 後方:指揮官と大きな軍旗、太鼓、護衛 -----
  const total = army.troops.infantry + army.troops.cavalry + army.troops.archer;
  const rank = total >= 30000 ? 1.5 : total >= 10000 ? 1.25 : total >= 5000 ? 1.1 : 0.95;
  const cy = rider(0, z + 0.05, 1.25);
  add(2, 0, cy + 0.07, z + 0.065, 0.03, 0.036, 0.006, C.drum); // 指揮官の外套
  const bannerH = 0.34 * rank;
  kit.banner(-0.06, z + 0.05, bannerH);
  const dy = ground(0.07, z + 0.05);
  add(2, 0.07, dy, z + 0.05, 0.03, 0.02, 0.03, C.wagon); // 太鼓の台
  add(2, 0.07, dy + 0.02, z + 0.05, 0.026, 0.024, 0.026, C.drum); // 太鼓
  const guards = Math.min(8, Math.max(2, Math.round(rank * 4)));
  for (let i = 0; i < guards; i++) {
    cavalry((i - (guards - 1) / 2) * 0.055, z + 0.16);
  }
  z += 0.26;

  // ----- 最後尾:輜重(食糧や武具を運ぶ荷車)。5,000人以上の軍に付く -----
  if (total >= 5000) {
    const wagons = Math.min(14, Math.round(Math.sqrt(total) / 14) + 2);
    const perRow = Math.min(wagons, 5);
    for (let i = 0; i < wagons; i++) {
      const r = Math.floor(i / perRow);
      const inRow = Math.min(perRow, wagons - r * perRow);
      wagon((i % perRow - (inRow - 1) / 2) * 0.075, z + 0.07 + r * 0.14);
    }
    const rows = Math.ceil(wagons / perRow);
    add(3, 0, ground(0, z + rows * 0.07), z + rows * 0.07, perRow * 0.075, 0.03, rows * 0.14, C.cover);
    z += rows * 0.14 + 0.02;
  }

  // 前後の中心が原点に来るよう、全体をずらす
  const depth = z;
  for (const p of parts) p.z -= depth / 2;

  return { parts, radius: Math.hypot(halfWidth, depth / 2), height: bannerH + 0.03 };
}
