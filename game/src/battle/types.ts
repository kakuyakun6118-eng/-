// 3D会戦で使うデータの形。戦略マップの軍団データとは別に、戦闘専用の状態として持つ。
import type { BattleRecord, UnitTypeId } from "../data/types";

export type SideId = "attacker" | "defender";

/** 部隊の兵科(槍兵・剣盾兵・重装歩兵・軽騎兵・重騎兵・弓兵・弩兵・本陣) */
export type UnitClassId =
  | "spearmen" | "swordsmen" | "heavyInfantry" | "lightCavalry" | "heavyCavalry" | "archers" | "crossbowmen" | "guard";

/** 兵科ごとの決まり(data/rules/battleUnits.json) */
export interface UnitClass {
  name: string;
  /** 戦略マップ上の兵種(歩兵・騎兵・弓兵)のどれにあたるか */
  category: UnitTypeId;
  /** 歩く速さ・走る速さ(戦場の長さ/秒) */
  walk: number;
  run: number;
  melee: number;
  defense: number;
  /** 突撃の衝撃力 */
  charge: number;
  /** 矢に対する防具の強さ(0〜1) */
  armor: number;
  /** 騎兵に対する強さ(槍兵は高い) */
  antiCavalry: number;
  /** 兵士どうしの間隔 */
  spacing: number;
  /** 飛び道具の射程・威力・装填時間(秒)。弓兵と弩兵だけが持つ */
  range?: number;
  missile?: number;
  reload?: number;
  /** 防具を貫きやすい(弩) */
  piercing?: boolean;
}

/** 部隊の状態 */
export type UnitState = "idle" | "moving" | "melee" | "shooting" | "routing" | "retreating" | "gone";

/** 部隊への命令 */
export type UnitOrder =
  | { kind: "hold" }
  | { kind: "move"; x: number; z: number }
  | { kind: "attack"; targetId: string }
  | { kind: "pursue"; targetId?: string } // 近くの敵を自分で探して攻める(targetId は、いま狙っている相手)
  | { kind: "retreat" };

/** 戦闘中の部隊 */
export interface BattleUnit {
  id: string;
  side: SideId;
  classId: UnitClassId;
  name: string;
  /** 戦略マップに戻すとき、どの兵種の兵力として数えるか */
  source: UnitTypeId;
  /** 本陣(指揮官のいる部隊)か */
  isCommand: boolean;
  men: number;
  maxMen: number;
  x: number;
  z: number;
  /** 向き(ラジアン)。0 で -z 方向、時計回り */
  facing: number;
  /** 隊列の横の人数(兵士の人形の数)と、いまの幅・奥行き */
  columns: number;
  width: number;
  depth: number;
  morale: number;
  baseMorale: number;
  fatigue: number;
  state: UnitState;
  order: UnitOrder;
  /** いま接近戦をしている相手 */
  engaged: string[];
  /** 走っているか(突撃の判定と、見た目に使う) */
  running: boolean;
  /** 次に射撃できるまでの秒数 */
  reloadLeft: number;
  /** 直近に受けた損害の割合(士気の計算に使う) */
  recentLoss: number;
  /** 最後に敵と戦ってからの秒数 */
  calm: number;
  /** 戦場から逃げ去った、または撤退し終えた */
  escaped: boolean;
}

/** 見た目のための出来事(矢の斉射、突撃の衝突、敗走など) */
export type BattleFx =
  | { kind: "volley"; fromX: number; fromZ: number; toX: number; toZ: number; flight: number; count: number }
  | { kind: "impact"; x: number; z: number }
  | { kind: "rout"; unitId: string }
  | { kind: "commanderDown"; side: SideId };

export type CommanderFate = "healthy" | "wounded" | "captured" | "killed";

/** 片方の陣営の戦闘結果 */
export interface SideResult {
  armyId: string | null;
  outcome: "victory" | "retreated" | "routed" | "annihilated" | "draw";
  before: Record<UnitTypeId, number>;
  /** 戦略マップに戻す兵力(負傷から復帰した兵を含む) */
  after: Record<UnitTypeId, number>;
  killed: number;
  wounded: number;
  captured: number;
  /** 戦場から逃げ散って戻らなかった兵 */
  scattered: number;
  commander: CommanderFate;
  morale: number;
  fatigue: number;
}

/** 戦闘結果。battleId と armyId を使って、戦略マップの軍団へ書き戻す */
export interface BattleResult extends BattleRecord {
  battleId: string;
  sides: Record<SideId, SideResult>;
}
