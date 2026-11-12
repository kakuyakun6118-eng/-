// ゲームで使うデータの「型」(形の決まり)をまとめたファイル。
// 位置はすべて [経度, 緯度] で持つ。3D座標への変換は core/geo.ts だけが行う。

/** [経度, 緯度] */
export type LonLatPair = [number, number];

export interface RegionInfo {
  id: string;
  name: string;
  /** 地域の範囲(緯度経度) */
  bounds: { west: number; east: number; south: number; north: number };
  /** 地形の立体の細かさ(度)。小さいほど細かく、重くなる */
  gridStep: number;
}

export interface River {
  id: string;
  name: string;
  /** 川の太さの目安(大河ほど大きい) */
  width: number;
  /** 流路。1本の川が複数の線に分かれていることがある */
  lines: LonLatPair[][];
}

export type CityRank = "capital" | "major" | "town";

/** 宮殿や役所など、塀で囲まれた一角 */
export interface PalaceSpec {
  /** 城の中心から見た位置(城の幅・奥行きに対する割合。-0.5〜0.5。南が+) */
  center: [number, number];
  /** 大きさ(城の幅・奥行きに対する割合) */
  size: [number, number];
  /** 中心線に並ぶ殿舎の数 */
  halls: number;
  /** 1 = 役所、2 = 宮殿(屋根が二重になる) */
  grade: 1 | 2;
}

/** 都市の「設計図」。これをもとに3Dの都市を組み立てる */
export interface CityLayout {
  /** 外城の東西・南北の大きさ(3D空間での長さ) */
  size: [number, number];
  wallHeight: number;
  wallThickness: number;
  gateWidth: number;
  /** 北・南・東・西の城門の数 */
  gates: { n: number; s: number; e: number; w: number };
  /** 城門の上の楼閣の階数 */
  gateStoreys: number;
  /** 南の正門を特に大きくする */
  grandGate?: boolean;
  cornerTowers: boolean;
  /** 城壁1辺あたりの望楼の数 */
  wallTowers: number;
  /** 民家の密度(0〜1) */
  density: number;
  /** 楼閣・市場などの主要施設の数 */
  landmarks: number;
  palaces?: PalaceSpec[];
  /** 城の角にある小さな城(金墉城・子城など) */
  citadel?: { corner: "nw" | "ne" | "sw" | "se"; size: number };
  /** 西の城壁沿いの高台(鄴の三台) の数 */
  terraces?: number;
  /** 兵舎の棟数 */
  barracks?: number;
  /** 水濠で囲む */
  moat?: boolean;
  /** 城壁の外の民家の数 */
  suburbs?: number;
}

export interface CityLevelRule {
  label: string;
  layout: CityLayout;
}

/** 都市。「どの勢力のものか」はここには書かず、シナリオ側で決める */
export interface City {
  id: string;
  name: string;
  reading: string;
  lon: number;
  lat: number;
  rank: CityRank;
  description: string;
  /** 都市の規模(1〜4)。指定があると、城壁や建物のある3D都市として表示する */
  level?: 1 | 2 | 3 | 4;
  /** 人口(ゲーム上の数値) */
  population?: number;
  /** 城の防御力(ゲーム上の数値。0〜100) */
  defense?: number;
  /** その都市だけの個性。規模ごとの標準の形に上書きする */
  layout?: Partial<CityLayout>;
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
  /** 地形ファイル(標高と水辺を画像にしたもの)の場所 */
  terrainUrl: string;
  rivers: River[];
  cities: City[];
}
