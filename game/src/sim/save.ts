// セーブデータの形と、バージョンの管理。
// 形を変えたら SAVE_VERSION を上げ、migrateSave に古い版からの変換を書き足す。
import type { Faction, PersonRole } from "../data/types";
import type { SpoilsSave } from "./spoils";
import type { LoyaltySave } from "./loyalty";
import type { EconomySave } from "./economy";
import type { CommanderFate } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, CityState, PersonStatus } from "../data/types";
import type { Route } from "./pathfinding";

export const SAVE_VERSION = 2;

/** 勢力どうしの関係。いまは切り替える手段がなく、すべて戦争として扱う(将来の外交のための入れ物) */
/** 国どうしの関係。"peace" は古いセーブの値で、中立として読む */
export type Relation = "war" | "hostile" | "neutral" | "friendly" | "nonaggression" | "alliance" | "vassal" | "peace";

/** 軍団1つ分の保存内容 */
export interface ArmySave {
  army: Army;
  status: ArmyStatus;
  route: Route | null;
  progress: number;
  supplied: boolean;
  ignore: string[];
  targetCityId: string | null;
  commanderFate?: CommanderFate;
}

/** 進行(sim/Campaign)が持つ状態 */
export interface CampaignSave {
  day: number;
  nextEventId: number;
  armies: ArmySave[];
  events: BattleEvent[];
  /** 攻城戦を受けた都市の状態(守備兵・食糧・士気・損傷・守将) */
  cityStates: Record<string, CityState>;
  /** 勢力の組("a|b")ごとの関係。書かれていない組は、シナリオの最初の関係(無ければ和平) */
  relations: Record<string, Relation>;
  /** 人物の状態(負傷・捕虜・死亡)。健在の人物は入れない */
  personStates: Record<string, PersonStatus>;
  /** 勢力の蓄え(金・糧) */
  factionStates: Record<string, { gold: number; grain: number }>;
  /** 関係が最後に変わった日("a|b" → 日数)。古いセーブには無い */
  relationSince?: Record<string, number>;
  /** 最近の出来事(AIの行動・戦いの結果) */
  news?: { day: number; text: string }[];
  /** プレイヤーへの外交の申し入れ(返事待ち) */
  proposals?: { from: string; kind: "peace" | "alliance"; day: number }[];
  /** 外交(友好度・条約・婚姻・援軍)。古いセーブには無い */
  diplomacy?: import("./diplomacy").DiplomacySave;
  /** 皇室(家系・子女・後継者・即位)。古いセーブには無い */
  court?: import("./court").CourtSave;
  /** 歴史の重大事件と年表。古いセーブには無い */
  history?: import("./history").HistorySave;
  /** 交易と兵站の記録。古いセーブには無い */
  trade?: import("./trade").TradeSave;
  logistics?: { attrition: Record<string, number>; expeditions: Record<string, number> };
  /** 財政・官職・内政(古いセーブには無い。無ければ、官職を割り当て直す) */
  economy?: EconomySave;
  /** 忠誠度・名声(古いセーブには無い。無ければ、読み込んだ時点の状況から作り直す) */
  loyalty?: LoyaltySave;
  /** 後継国家・滅亡・君主の付け替え(古いセーブには無い) */
  dynasty?: DynastySave;
  /** 名品・捕虜・保護・陥落の記録(古いセーブには無い) */
  spoils?: SpoilsSave;
  /** 次に作る軍団の番号 */
  nextArmyId?: number;
}

export interface GameSettings {
  /** 操作する勢力(null なら、どの勢力の軍団にも命令できる) */
  playerFactionId: string | null;
  difficulty: "veryEasy" | "easy" | "normal" | "hard" | "veryHard";
  territoryVisible: boolean;
  /** 領土の色の濃さ(0.3〜1.6) */
  territoryOpacity: number;
  /** 時間の進む速さ(停止していないときの倍率) */
  speed: number;
  /** 自分の国が滅びたとき:ゲームオーバーにするか、独立した後継国家で続けるか(古いセーブには無い) */
  onFall?: "gameover" | "continue";
  /** 歴史の流れ:史実重視(AIは史実の行動を選びやすい)か、自由歴史か(古いセーブには無い。無ければ史実重視) */
  historyMode?: "historic" | "free";
}

/** 都市1つ分の保存内容(所属と、いまの状態をまとめたもの) */
export interface CitySave extends CityState {
  ownerId: string | null;
  population: number | null;
}

export interface SaveData {
  version: number;
  savedAt: string;
  scenarioId: string;
  /** 一覧に表示する情報 */
  summary: { date: string; year: number; season: string; playerFaction: string };
  settings: GameSettings;
  /** 全勢力(IDと色。色はデータ側が正で、ここは記録用) */
  factions: { id: string; name: string; color: string }[];
  /** 全都市の所属と状態 */
  cities: Record<string, CitySave>;
  campaign: CampaignSave;
  /** 保存したときに開いていた会戦(読み込むと、その準備画面に戻る) */
  activeBattle: { battleId: string; stage: "preparing" | "fighting" } | null;
}

/** 月から季節を求める(1〜3月を春とする、旧暦の区切り) */
export function seasonOf(month: number): string {
  return month <= 3 ? "春" : month <= 6 ? "夏" : month <= 9 ? "秋" : "冬";
}

/**
 * 読み込んだデータを、いまの版の形に直す。読めないデータなら、理由を付けて失敗させる。
 */
export function migrateSave(raw: unknown): SaveData {
  if (!raw || typeof raw !== "object") throw new Error("セーブデータの形が正しくありません");
  const data = raw as Partial<SaveData>;
  if (typeof data.version !== "number") throw new Error("セーブデータのバージョンが分かりません");
  if (data.version > SAVE_VERSION) throw new Error(`このセーブデータは新しい版(v${data.version})のものです。ゲームを更新してください`);
  // v1 → v2:人物の状態と勢力の蓄えが加わった。都市・関所・人物が増えた分は、読み込む側が初期状態で補う
  if (data.version < 2 && data.campaign) {
    data.campaign.personStates = {};
    data.campaign.factionStates = {};
  }
  if (!data.campaign || !Array.isArray(data.campaign.armies) || !data.cities || !data.settings) {
    throw new Error("セーブデータの中身が欠けています");
  }
  data.campaign.relations ??= {};
  data.campaign.cityStates ??= {};
  data.campaign.personStates ??= {};
  data.campaign.factionStates ??= {};
  data.version = SAVE_VERSION;
  return data as SaveData;
}

/** 国の滅亡と独立の記録 */
export interface DynastySave {
  added: Faction[];
  fallen: Record<string, { day: number; by: string | null }>;
  roles: Record<string, PersonRole>;
  rulers: Record<string, string>;
  gameOver?: boolean;
  /** 滅亡のとき、後継国家が受け継げずに散逸した金の合計 */
  scattered?: number;
}
