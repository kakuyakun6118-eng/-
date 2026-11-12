// 停止中の軍団の「野営」を組み立てる。
// 柵で囲んだ軍営の中央に指揮官の本営と軍団旗、そのまわりに天幕、待機する兵士、
// つないだ馬、荷車、かがり火を置き、門と四隅に見張りを立てる。
//
// 座標の決まり:軍営の中心が原点。-z が正面(門のある側)。
import type { Army } from "../../data/types";
import type { Part } from "../parts/instancing";
import type { ArmyBlueprint } from "./ArmyBuilder";
import { C, createFigureKit, figureCount, shade } from "./figures";

export function buildCamp(army: Army, color: string, ground: (x: number, z: number) => number): ArmyBlueprint {
  const parts: Part[] = [];
  const kit = createFigureKit(parts, `${army.id}-camp`, color, ground);
  const { add, rand, infantry, rider, flag, wagon } = kit;
  const total = army.troops.infantry + army.troops.cavalry + army.troops.archer;
  const rank = total >= 30000 ? 1.5 : total >= 10000 ? 1.25 : total >= 5000 ? 1.1 : 0.95;

  // 天幕の数は兵力で決める(1,000人で5張、34,000人で約30張)
  const tents = Math.max(4, Math.min(36, Math.round(Math.sqrt(total) / 6)));
  const cols = Math.max(3, Math.ceil(Math.sqrt(tents * 1.5)));
  const rows = Math.max(3, Math.ceil((tents + 4) / cols) + 1);
  const gapX = 0.12;
  const gapZ = 0.115;
  const halfW = (cols * gapX) / 2 + 0.07;
  const halfD = (rows * gapZ) / 2 + 0.07;

  // ----- 柵:正面の中央だけ開けて門にする -----
  const fence = (x: number, z: number, sx: number, sz: number): void => {
    add(0, x, ground(x, z), z, sx, 0.03, sz, C.fence);
  };
  const gate = 0.09;
  fence(-(halfW + gate) / 2, -halfD, halfW - gate, 0.012);
  fence((halfW + gate) / 2, -halfD, halfW - gate, 0.012);
  fence(0, halfD, halfW * 2, 0.012);
  fence(-halfW, 0, 0.012, halfD * 2);
  fence(halfW, 0, 0.012, halfD * 2);

  // ----- 見張り:門の両脇と四隅に兵士と小旗 -----
  infantry(-gate * 0.8, -halfD - 0.03);
  infantry(gate * 0.8, -halfD - 0.03);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * halfW;
    const z = sz * halfD;
    flag(x, z, 0.16, 0.05);
    infantry(x - sx * 0.035, z - sz * 0.035);
  }

  // ----- 本営:中央のいちばん大きな天幕と軍団旗、太鼓、護衛 -----
  const hqW = 0.13 * rank;
  const hqD = 0.1 * rank;
  const hy = ground(0, 0);
  add(0, 0, hy, 0, hqW, 0.03 * rank, hqD, C.tent);
  add(0, 0, hy + 0.03 * rank, 0, hqW * 1.2, 0.05 * rank, hqD * 1.3, shade(color, 0.9), "hip"); // 屋根は勢力の色
  const bannerH = 0.34 * rank;
  kit.banner(-hqW * 0.75, -hqD * 0.2, bannerH);
  const dy = ground(hqW * 0.75, -hqD * 0.3);
  add(2, hqW * 0.75, dy, -hqD * 0.3, 0.03, 0.02, 0.03, C.wagon);
  add(2, hqW * 0.75, dy + 0.02, -hqD * 0.3, 0.026, 0.024, 0.026, C.drum);
  for (const dir of [-1, 1]) infantry(dir * hqW * 0.35, -hqD * 0.75);

  // ----- 天幕:本営のまわりに碁盤の目に並べる。うしろの1列は荷車と馬のために空ける -----
  let placed = 0;
  const spots: [number, number][] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * gapX;
      const z = (r - (rows - 1) / 2) * gapZ;
      if (Math.abs(x) < hqW * 0.9 + 0.03 && Math.abs(z) < hqD * 0.9 + 0.04) continue; // 本営の場所
      if (Math.abs(x) < 0.03 && z < 0) continue; // 門から本営への通路
      spots.push([x, z]);
    }
  }
  for (const [x, z] of spots) {
    if (placed >= tents) {
      // 天幕のない場所には、かがり火と兵士を置く
      if (rand() < 0.5) {
        const y = ground(x, z);
        add(2, x, y, z, 0.022, 0.006, 0.022, C.ash);
        add(2, x, y + 0.006, z, 0.012, 0.012, 0.012, C.ember);
        infantry(x + 0.03, z);
      }
      continue;
    }
    placed++;
    const y = ground(x, z);
    const cloth = rand() < 0.5 ? C.tent : C.tentDark;
    add(0, x, y, z, 0.062, 0.016, 0.05, cloth);
    add(0, x, y + 0.016, z, 0.074, 0.032, 0.062, shade(cloth, 0.93), "hip");
    // 天幕の前で待機する兵士
    if (rand() < 0.75) infantry(x + (rand() - 0.5) * 0.05, z - 0.045);
    if (rand() < 0.35) infantry(x + (rand() - 0.5) * 0.05, z + 0.045);
  }

  // ----- うしろの列:荷車と、つないだ馬 -----
  const backZ = ((rows - 1) / 2) * gapZ;
  const wagons = total >= 5000 ? Math.min(cols, Math.round(Math.sqrt(total) / 20) + 2) : 1;
  const horses = Math.min(cols * 2, Math.round(figureCount(army.troops.cavalry) * 0.25));
  for (let i = 0; i < wagons; i++) {
    wagon(-halfW + 0.09 + i * 0.07, backZ, false);
  }
  for (let i = 0; i < horses; i++) {
    rider(halfW - 0.07 - Math.floor(i / 2) * 0.045, backZ - 0.03 + (i % 2) * 0.075, 1, false);
  }

  // 遠いとき用:軍営の地面を、踏み固めた土の色の板で表す
  add(3, 0, ground(0, 0), 0, halfW * 2, 0.012, halfD * 2, "#8f8262");

  return { parts, radius: Math.hypot(halfW, halfD), height: bannerH + 0.03 };
}
