// ゲームで使うデータの「型」(形の決まり)をまとめたファイル。
// 位置はすべて [経度, 緯度] で持つ。3D座標への変換は core/geo.ts だけが行う。

/** [経度, 緯度] */
export type LonLatPair = [number, number];

export interface RegionInfo {
  id: string;
  name: string;
  /** 地域の範囲(緯度経度) */
  bounds: { west: number; east: number; south: number; north: number };
  /** 地形の細かさ(度)。小さいほど細かく、重くなる */
  gridStep: number;
}

/** 高原など、広く盛り上がった土地 */
export interface Highland {
  id: string;
  name: string;
  center: LonLatPair;
  /** 東西・南北の広がり(度) */
  radius: [number, number];
  height: number;
}

/** 山脈。点をつないだ線に沿って山が連なる */
export interface Ridge {
  id: string;
  name: string;
  height: number;
  /** 山脈の幅(度) */
  width: number;
  points: LonLatPair[];
}

export interface Sea {
  id: string;
  name: string;
  polygon: LonLatPair[];
}

export interface TerrainData {
  highlands: Highland[];
  ridges: Ridge[];
  seas: Sea[];
}

export interface River {
  id: string;
  name: string;
  /** 川の太さ(見た目用) */
  width: number;
  points: LonLatPair[];
}

export type CityRank = "capital" | "major" | "town";

/** 都市。「どの勢力のものか」はここには書かず、シナリオ側で決める */
export interface City {
  id: string;
  name: string;
  reading: string;
  lon: number;
  lat: number;
  rank: CityRank;
  description: string;
}

export interface Faction {
  id: string;
  name: string;
  people: string;
  ruler: string;
  color: string;
}

/** ある年代の勢力図 */
export interface Scenario {
  id: string;
  year: number;
  name: string;
  summary: string;
  factions: Faction[];
  /** 都市ID → 勢力ID */
  cityOwners: Record<string, string>;
}

/** 1つの地域にまとめたデータ一式 */
export interface RegionData {
  info: RegionInfo;
  terrain: TerrainData;
  rivers: River[];
  cities: City[];
}
