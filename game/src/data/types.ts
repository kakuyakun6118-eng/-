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

/** 関所・要衝(都市とは別のデータ。passes.json) */
export interface Pass {
  id: string;
  name: string;
  reading: string;
  lon: number;
  lat: number;
  /** 防御力(0〜100)と、最初の守備兵 */
  defense: number;
  garrison: number;
  /** 守将(人物ID) */
  governorId?: string;
  /** この関所が結ぶ2つの都市のID */
  between: [string, string];
  /** どことどこを結ぶ道を押さえるか */
  connects: string;
  /** 名称や位置についての注記(時代による違いなど) */
  note: string;
  /** 塞ぐ線。この線の上の山は越えられず、関所の地点だけが通れる(ゲーム上の設定) */
  barrier: LonLatPair[];
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
  /** 守備兵力(ゲーム上の数値)。省略すると都市の規模から決める */
  garrison?: number;
  /** 都市か関所か。関所は、地図の表示・攻城戦・占領を都市と同じ仕組みで扱うために、都市の形に直して持つ */
  kind?: "city" | "pass";
  /** 関所のときの、元のデータ */
  pass?: Pass;
  /** 経済力(1か月の金の収入)と、食糧生産(1か月の糧の収入)。ゲーム上の数値 */
  economy?: number;
  food?: number;
  /** 交通の重要度・軍事の重要度(1〜5)。ゲーム上の数値 */
  transport?: number;
  military?: number;
  /** 太守・守将(人物ID。省略すると、守将なし) */
  governorId?: string;
  /** 城郭の数値を、その都市だけ変えたいときに書く(城壁・城門の耐久、食糧、士気など) */
  fort?: Partial<Pick<Fortification, "wallHp" | "gateHp" | "food" | "morale">>;
  /** その都市だけの個性。規模ごとの標準の形に上書きする */
  layout?: Partial<CityLayout>;
  /** オアシス(砂漠の中の補給地)か */
  oasis?: boolean;
  /** 地方の名前(西域など) */
  region?: string;
  /** 位置や数値の根拠・異説の注記 */
  note?: string;
}

export interface Faction {
  id: string;
  name: string;
  people: string;
  ruler: string;
  color: string;
  /** 自分からは動かない勢力(まとまった国を持たない人々など)。戦略AIは動かさない */
  passive?: boolean;
  /** 君主の称号(皇帝・王・公など)。後継国家のときに入る */
  title?: string;
  /** 後継国家:もとの国と、独立した日(ゲーム開始からの日数) */
  founded?: { from: string; day: number };
  /** 滅亡した日 */
  fallen?: { day: number; by: string | null };
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

/** 人物の役割(人物画面の分類に使う) */
export type PersonRole = "ruler" | "general" | "strategist" | "minister";

/** 人物の状態:健在・負傷・捕虜・死亡 */
/** 健在・負傷・捕虜・死亡・保護(都市が落ちたときに保護された人。捕虜とは別) */
export type PersonStatus = "active" | "wounded" | "captured" | "dead" | "protected";

/**
 * 人物(君主・武将・軍師)。軍団の指揮官、都市の太守、関所の守将として、IDで参照する。
 * 能力値・特性・得意兵科は、ゲーム上の設定(史実の評価そのものではない)。
 */
export interface Person {
  id: string;
  name: string;
  reading: string;
  /** 生年・没年(西暦)。分からなければ null */
  born: number | null;
  died: number | null;
  factionId: string;
  role: PersonRole;
  /** 官職・称号(317年ごろ。分からなければ空) */
  title: string;
  /** 統率:部隊の士気と戦闘能力に効く */
  leadership: number;
  /** 武力:本人と本陣の戦闘能力に効く */
  war: number;
  /** 知力:側面を突かれたときの粘りや、射撃の精度などの戦術補正に効く */
  intelligence: number;
  /** 政治・魅力(内政・外交・登用で使う予定) */
  politics: number;
  charisma: number;
  traits: string[];
  favoredUnit: UnitTypeId | null;
  /** 人物の説明・経歴 */
  bio: string;
  /** 性別。書かれていなければ男性 */
  gender?: "male" | "female";
  /** 外交・文化(女性の人物などに設定。書かれていなければ表示しない) */
  diplomacy?: number;
  culture?: number;
  /** いま滞在している都市(シナリオの名簿で決まる。都市が落ちたとき、その場にいた人として扱う) */
  residence?: string;
  /** 民族(漢・匈奴・羯・鮮卑・氐・羌 など)。確かでないものは「不明」 */
  people?: string;
  /** 民族についての注記(推定の根拠など) */
  peopleNote?: string;
  /** 所属・生存・活動が確かでないときの注記(画面に出す) */
  note?: string;
  /** 生没年に異説があるとき true */
  datesUncertain?: boolean;
  /** ゲームの中で生まれた・迎えた架空の人物のとき true(史実の人物と区別する) */
  fictional?: boolean;
  /** 史料の確かさ:史実確認済み・推定・伝承(架空は fictional) */
  certainty?: "史実確認済み" | "推定" | "伝承" | "不明";
  /** 別の表記(サンスクリット名など) */
  altName?: string;
}

/** 以前の名前(武将)。同じものを指す */
export type Officer = Person;

/** 軍団。地図の上を動き、会戦の結果もここに書き戻す */
export interface Army {
  id: string;
  name: string;
  factionId: string;
  /** 指揮官(武将のID) */
  commanderId: string;
  /** 副将(武将のID)。指揮官との相性が、士気と指揮に小さく効く */
  deputyId?: string;
  /** 配下の武将(Version 51:軍団結合で加わった、指揮官・副将以外の武将) */
  officers?: string[];
  /** 出陣した都市(Version 51:帰城先の候補「出発元の都市」) */
  originCityId?: string;
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

/**
 * 戦闘イベントの状態。
 * pending = 保留(対峙中) / preparing = 会戦準備画面を開いている / in_progress = 戦闘中
 * completed = 決着 / cancelled = 離脱などで取り消し
 */
export type BattleStatus = "pending" | "preparing" | "in_progress" | "completed" | "cancelled";

/** 戦闘イベント。敵と接触したときに作られ、会戦準備画面や会戦の入口になる */
export interface BattleEvent {
  battleId: string;
  /** AIどうしの攻城戦の包囲(Version 42):この日に決着する。それまでは包囲が続く */
  autoSiegeUntil?: number;
  battleType: BattleType;
  attackerArmyId: string;
  /** 野戦のときの相手の軍団(攻城戦では null) */
  defenderArmyId: string | null;
  /** 攻城戦のときの相手の都市(野戦では null) */
  defenderCityId: string | null;
  location: { lon: number; lat: number; name: string };
  terrain: TerrainKind;
  attackerFactionId: string;
  defenderFactionId: string;
  status: BattleStatus;
  /** 発生した日(ゲーム開始からの日数と、画面に出す日付) */
  createdAt: { day: number; text: string };
  /** 決着したあとの記録(勝敗と損害) */
  record?: BattleRecord;
  /** 近くにいて加勢した、同盟国・援軍の軍団(共同作戦)。efficiency は連携の度合い(0.5〜1) */
  supporters?: { side: "attacker" | "defender"; armyId: string; efficiency: number; relief?: boolean; km?: number; arriveSec?: number }[];
  /** 救援に向かおうとして、道を阻まれた軍団(Version 42) */
  reliefBlocked?: { armyId: string; by: string }[];
  /** 歴史の重大事件の会戦(淝水の戦いなど)のとき、その事件のID */
  histId?: string;
  /** 作戦による補正(歴史の事件の選択などで決まる) */
  tactics?: BattleTactics;
}
export interface BattleTactics {
  /** 陣営ごとの強さの倍率(連携・指揮・作戦) */
  attacker?: number;
  defender?: number;
  /** 川の守りの利を消す(相手の渡河を許した) */
  noRiverBonus?: boolean;
  /** 退くときに崩れやすい陣営(撤退時の混乱) */
  panic?: "attacker" | "defender";
  /** 混乱の大きさ(0〜1。大きいほど崩れやすい) */
  panicRisk?: number;
  notes?: string[];
  /** 特別な陣形(劉裕の北伐の却月陣など):その側の歩兵・弓兵が、はじめからこの陣形を組む */
  formation?: { side: "attacker" | "defender"; id: "queyue" };
}


/** 戦闘の記録。イベントに残して、あとから戦歴として見られるようにする */
export interface BattleRecord {
  winner: "attacker" | "defender" | "draw";
  /** 決着の理由:全滅 / 主力の敗走 / 撤退 / 時間切れ */
  reason: "annihilated" | "routed" | "retreated" | "timeout" | "captured" | "surrendered";
  durationSeconds: number;
  attackerLosses: number;
  defenderLosses: number;
  /** 攻城戦のときだけ入る */
  siege?: SiegeOutcome;
  /** 攻城戦の救援軍(Version 41):軍団ごとの、戦いのあとの兵力と士気(3Dの攻城戦のときだけ入る) */
  relief?: Record<string, { after: Record<UnitTypeId, number>; morale: number }>;
  /** 救援軍のうち、着いて戦いに加わった軍団(自動の攻城戦で入る) */
  reliefJoined?: string[];
}

/** 攻城戦の結末 */
export interface SiegeOutcome {
  cityId: string;
  /** 都市が落ちたか */
  captured: boolean;
  /** 攻城にかかった日数 */
  days: number;
  /** 攻めた面の城壁・城門のうち、壊れた割合(0〜1) */
  wallDamage: number;
  gateDamage: number;
  /** 残った食糧(日数) */
  foodLeft: number;
}

/** 都市の守り(攻城戦の防御側の情報) */
export interface Fortification {
  /** 城壁の規模(「王都」など) */
  scale: string;
  /** 城防御力(0〜100) */
  defense: number;
  /** 防御施設の一覧(角楼、望楼、水濠など) */
  facilities: string[];
  /** 城壁の高さ・厚さ(都市の設計図の値)と、攻める面の城門の数 */
  wallHeight: number;
  wallThickness: number;
  gates: number;
  /** 城壁1区画・城門1つの耐久力(損傷のない状態での値) */
  wallHp: number;
  gateHp: number;
  /** 食糧の備蓄(日数)と、守備隊の士気 */
  food: number;
  morale: number;
  /** これまでの戦いで受けた損傷(0 = 無傷、1 = 全壊)。直るには日数がかかる */
  wallDamage: number;
  gateDamage: number;
}

/** 都市の、いまの状態。攻城戦の結果で変わり、次の戦いに引き継がれる */
export interface CityState {
  garrison: number;
  /** 守備兵のうち、騎兵・弓兵の人数(Version 51。残りは歩兵。無ければ歩兵7割・弓兵3割とみなす) */
  garrisonMix?: { cavalry: number; archer: number };
  food: number;
  morale: number;
  wallDamage: number;
  gateDamage: number;
  /** いまの太守・守将(人物ID。任命で変わる)。null は「いない」。書かれていなければ、都市データの最初の太守 */
  governorId?: string | null;
  /** 守将の状態(戦死・捕虜なら、守将はいなくなる) */
  governorFate?: "healthy" | "wounded" | "captured" | "killed";
  /** 都市の繁栄(0〜100。収入に掛かる。略奪で大きく下がり、少しずつ戻る) */
  prosperity?: number;
  /** 治安(0〜100) */
  order?: number;
  /** 内政:農業・商業の開発度(0〜100)、民忠(0〜100)、いまの人口、城郭整備の上乗せ(城防御に足す) */
  agri?: number;
  commerce?: number;
  support?: number;
  pop?: number;
  fortify?: number;
  /** 最後に内政を行った日(同じ都市では60日に1度まで) */
  devDay?: number;
  /** 最近の募兵(90日のあいだの人数。多いほど治安と民忠が下がる) */
  recruitRecent?: number;
  recruitDay?: number;
}

/** 会戦の片方の陣営。軍団でも都市でも同じ形で扱う */
export interface BattleSide {
  role: "attacker" | "defender";
  kind: "army" | "city";
  factionId: string;
  armyId: string | null;
  cityId: string | null;
  name: string;
  commander: Officer | null;
  /** 副将と、指揮官との相性による士気の補正(-4〜+4) */
  deputy?: Officer | null;
  synergy?: number;
  /** 兵種ごとの兵力(会戦開始時点の写し) */
  troops: Record<UnitTypeId, number>;
  morale: number;
  fatigue: number;
  food: number;
  /** 都市のときだけ入る */
  fortification: Fortification | null;
  /** 加勢している軍団(兵力はこの陣営の troops に含まれる) */
  supporters?: { armyId: string; name: string; factionId: string; troops: number; efficiency: number; relief?: { by: Record<UnitTypeId, number>; morale: number; arriveSec: number; commander: string | null } }[];
}

/**
 * 会戦の設定。会戦準備画面と、次段階の3D戦闘に渡すデータ一式。
 * 軍団のデータそのものは戦略マップ側が持ち続け、ここにはその時点の写しとIDだけを入れる。
 * 戦闘の結果は、battleId と armyId を使って戦略マップ側へ書き戻す。
 */
export interface BattleSetup {
  battleId: string;
  battleType: BattleType;
  name: string;
  location: { lon: number; lat: number; name: string };
  terrain: TerrainKind;
  createdAt: { day: number; text: string };
  attacker: BattleSide;
  defender: BattleSide;
  /** 作戦による補正 */
  tactics?: BattleTactics;
}

/** ある年代の勢力図 */
export interface Scenario {
  id: string;
  year: number;
  /** 開始する月(1〜12)。省くと3月 */
  startMonth?: number;
  name: string;
  summary: string;
  /** 年代によって違う都市名(都市ID → その年代の名前と読み) */
  cityNames?: Record<string, { name: string; reading: string }>;
  /** 年代によって違う都市の格・守り・守備兵(劉裕の北伐の追加:416年の統万城など)。書いた項目だけ都市データを上書きする */
  cityOverrides?: Record<string, { level?: 1 | 2 | 3 | 4; defense?: number; garrison?: number; note?: string }>;
  /** このシナリオの説明(簡略化した点、推定で置いた点) */
  scenarioNote?: string;
  factions: Faction[];
  /** 都市ID → 勢力ID */
  cityOwners: Record<string, string>;
  /** 所属が史料で確かめにくく、推定で置いた都市 */
  uncertainOwners?: string[];
  /** 開始時の勢力どうしの関係("a|b" → war / peace / alliance)。書かれていない組は和平 */
  relations?: Record<string, string>;
  /** 開始時に都市・関所を守る人物(都市ID・関所ID → 人物ID) */
  governors?: Record<string, string>;
  /** 関所ID → 勢力ID */
  passOwners?: Record<string, string>;
  ownerNote?: string;
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
  /** 街道のつながり(都市ID・関所IDの組) */
  roads: string[][];
}

/** シナリオの目録の1件 */
export interface ScenarioEntry {
  id: string;
  year: number;
  title: string;
  summary: string;
  /** 選択画面に出す、おもな勢力とおもな人物 */
  powers?: string[];
  figures?: string[];
  /** ready = 遊べる / planned = 準備中(未実装) */
  status: "ready" | "planned";
}

/** シナリオごとの名簿の1人分。人物の台帳(生没年・能力・経歴)に、その年代の所属と官職を重ねる */
export interface RosterEntry {
  factionId: string;
  /** 滞在している都市 */
  cityId?: string;
  role?: PersonRole;
  title?: string;
  note?: string;
}

/** シナリオのファイル(1つの年代のデータ一式)。読み込むときに Scenario・人物・軍団に分ける */
export interface ScenarioFile extends Omit<Scenario, "cityOwners"> {
  /** 都市ID → 勢力ID。defaultOwner があれば、書かれていない都市はその勢力のもの */
  cityOwners: Record<string, string>;
  defaultOwner?: string;
  /** 名簿(人物ID → その年代の所属)。省くと、台帳に書かれた所属をそのまま使う */
  roster?: Record<string, RosterEntry>;
  /** 317年のように名簿を持たないシナリオで、女性の人物を置くための欄 */
  womenRoster?: Record<string, RosterEntry>;
  armies?: Army[];
}
