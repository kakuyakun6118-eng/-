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
  /** 塀ではなく、角楼と門のある城壁で囲む(内城・宮城) */
  fortified?: boolean;
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
  /** 坊(塀で囲まれた住宅区画)1つの大きさの目安 */
  wardSize?: number;
  /** 大通りの幅。省略すると城門の幅から決める */
  avenueWidth?: number;
  /** 街の中の楼閣の数 */
  landmarks: number;
  /** 市場の数 */
  markets?: number;
  /** 役所の数 */
  offices?: number;
  /** 宮殿のない都市の中心に置く建物(tower = 鼓楼、hall = 庁舎) */
  centerpiece?: "tower" | "hall";
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
  /** 都市の規模(1〜4)。城壁や建物の構えが変わる。省略すると都市の格から決める */
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

export type UnitTypeId = "infantry" | "cavalry" | "archer";

/** 兵種の決まり */
export interface UnitType {
  id: UnitTypeId;
  name: string;
  /** 行軍の速さ(歩兵を1とした比) */
  speed: number;
  description: string;
}

/** 武将 */
export interface Officer {
  id: string;
  name: string;
  reading: string;
  factionId: string;
  /** 統率(0〜100) */
  leadership: number;
  /** 武勇(0〜100) */
  valor: number;
}

/** 軍団。地図の上を動き、会戦の結果もここに書き戻す */
export interface Army {
  id: string;
  name: string;
  factionId: string;
  /** 指揮官(武将のID) */
  commanderId: string;
  lon: number;
  lat: number;
  /** 向き(度)。0 = 北、90 = 東、180 = 南、270 = 西 */
  facing: number;
  /** 兵種ごとの兵力 */
  troops: Record<UnitTypeId, number>;
  /** 士気・疲労(0〜100)と、食糧の備蓄(日数) */
  morale: number;
  fatigue: number;
  food: number;
  /** 最初の状態。省略すると野営 */
  status?: ArmyStatus;
}

/** 軍団の状態:待機・行軍中・野営中・補給中・戦闘中(敵と対峙) */
export type ArmyStatus = "idle" | "marching" | "camping" | "resupplying" | "fighting";

/** 大河を渡れる場所(渡し場・橋) */
export interface Crossing {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/** 地形の種類。進軍の速さが変わる */
export type TerrainKind =
  | "plain" | "grassland" | "desert" | "forest" | "hill" | "mountain" | "highMountain"
  | "river" | "crossing" | "greatRiver" | "water";

/** 地形ごとの決まり。cost は通りにくさ(平原が1。null は通れない) */
export interface TerrainRule {
  name: string;
  cost: number | null;
}

/** 戦闘の種類:野戦 / 攻城戦 */
export type BattleType = "field_battle" | "siege_battle";

/** 戦闘イベント。敵と接触したときに作られ、会戦画面や攻城戦の入口になる */
export interface BattleEvent {
  id: string;
  type: BattleType;
  attackerArmyId: string;
  /** 野戦のときの相手の軍団 */
  defenderArmyId: string | null;
  /** 攻城戦のときの相手の都市 */
  defenderCityId: string | null;
  lon: number;
  lat: number;
  /** pending = 開始待ち / active = 戦闘中 / resolved = 決着 / withdrawn = 離脱して不成立 */
  status: "pending" | "active" | "resolved" | "withdrawn";
  /** 発生した日(ゲーム開始からの日数) */
  day: number;
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
  /** 大河の渡河地点 */
  crossings: Crossing[];
}
