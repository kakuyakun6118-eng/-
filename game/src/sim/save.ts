// セーブデータの形と、バージョンの管理。
// 形を変えたら SAVE_VERSION を上げ、migrateSave に古い版からの変換を書き足す。
import type { CommanderFate } from "../battle/types";
import type { Army, ArmyStatus, BattleEvent, CityState } from "../data/types";
import type { Route } from "./pathfinding";

export const SAVE_VERSION = 1;

/** 勢力どうしの関係。いまは切り替える手段がなく、すべて戦争として扱う(将来の外交のための入れ物) */
export type Relation = "war" | "peace" | "alliance";

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
  /** 勢力の組("a|b")ごとの関係。書かれていない組は戦争 */
  relations: Record<string, Relation>;
}

export interface GameSettings {
  /** 操作する勢力(null なら、どの勢力の軍団にも命令できる) */
  playerFactionId: string | null;
  difficulty: "easy" | "normal" | "hard";
  territoryVisible: boolean;
  /** 領土の色の濃さ(0.3〜1.6) */
  territoryOpacity: number;
  /** 時間の進む速さ(停止していないときの倍率) */
  speed: number;
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
  // (ここに、古い版からの変換を書き足していく。例: if (data.version < 2) { ... })
  if (!data.campaign || !Array.isArray(data.campaign.armies) || !data.cities || !data.settings) {
    throw new Error("セーブデータの中身が欠けています");
  }
  data.campaign.relations ??= {};
  data.campaign.cityStates ??= {};
  data.version = SAVE_VERSION;
  return data as SaveData;
}
