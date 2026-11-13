// 会戦の戦場用の実地形データ(AW3D30の標高と、WorldCoverの土地被覆)の一覧。
// 収録範囲を増やすときは、sites.json に範囲を書いて tools/bake_battlefield.py を実行し、ここに登録する。
import siteList from "./sites.json";
import fukouTerrain from "./fukou-taihang.terrain.png";
import fukouWater from "./fukou-taihang.water.png";
import xiangguoTerrain from "./xiangguo-plain.terrain.png";
import xiangguoWater from "./xiangguo-plain.water.png";

export interface BattlefieldSite {
  id: string;
  name: string;
  bounds: { west: number; east: number; south: number; north: number };
  width: number;
  height: number;
  /** 標高と土地被覆の画像 */
  terrainUrl: string;
  /** 水域の画像。歴史的な流路のデータを作ったら、これを差し替える */
  waterUrl: string;
}

const FILES: Record<string, { terrainUrl: string; waterUrl: string }> = {
  "xiangguo-plain": { terrainUrl: xiangguoTerrain, waterUrl: xiangguoWater },
  "fukou-taihang": { terrainUrl: fukouTerrain, waterUrl: fukouWater },
};

export const battlefieldSites: BattlefieldSite[] = (siteList as Omit<BattlefieldSite, "terrainUrl" | "waterUrl">[])
  .filter((s) => FILES[s.id])
  .map((s) => ({ ...s, ...FILES[s.id] }));

/** 指定した地点のまわり(南北・東西に halfLat, halfLon 度)が、まるごと収録されている範囲を探す */
export function findBattlefieldSite(lon: number, lat: number, halfLon: number, halfLat: number): BattlefieldSite | null {
  return (
    battlefieldSites.find(
      (s) =>
        lon - halfLon >= s.bounds.west && lon + halfLon <= s.bounds.east &&
        lat - halfLat >= s.bounds.south && lat + halfLat <= s.bounds.north,
    ) ?? null
  );
}
