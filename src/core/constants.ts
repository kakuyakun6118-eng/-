// 数値定数はすべてここに集約する。

export const STARTING_YEAR = 395;
export const ENDING_YEAR = 476;
export const TOTAL_TURNS = 81;

export const INITIAL_TREASURY = 500;
export const INITIAL_TAX_BASE = 100;
export const INITIAL_FIELD_ARMY = 100;
export const INITIAL_LEGITIMACY = 80;
export const INITIAL_SENATE_SUPPORT = 60;
export const INITIAL_EAST_RELATIONS = 60;
export const INITIAL_FOEDERATI_LOYALTY = 70;

/** 属州収入に対する徴税効率 */
export const TAX_RATE = 0.6;

/** 野戦軍1ユニットあたりの維持費（ソリドゥス/ターン） */
export const ARMY_UPKEEP_PER_UNIT = 2;

/** 宮廷費（固定） */
export const COURT_UPKEEP = 50;

/** 国庫が負に転じたターンに脱走する野戦軍の割合 */
export const DESERTION_RATE = 0.1;

/** これ以下の野戦軍は事実上壊滅とみなす（脱走は乗算的減衰のため厳密に0にはならない） */
export const FIELD_ARMY_COLLAPSE_THRESHOLD = 5;

// ── 蛮族AI・戦闘 ──────────────────────────────────────

/** foederatiLoyalty がこれを下回るとフォエデラティが寝返る */
export const FOEDERATI_DEFECTION_LOYALTY_THRESHOLD = 20;

/** 境外の勢力がこの戦力未満なら侵入を試みない */
export const MIN_STRENGTH_TO_ADVANCE = 30;

/** 境外の勢力が毎ターン帝国領へ侵入を試みる確率 */
export const ADVANCE_PROBABILITY = 0.35;

/** 境外で待機している勢力の戦力成長率（ターンあたり） */
export const EXTERIOR_GROWTH_RATE = 0.05;

/** 属州の control がこれを下回ると定住されうる */
export const SETTLE_CONTROL_THRESHOLD = 30;

/** 定住には守備隊のこの倍率以上の戦力が必要 */
export const SETTLE_STRENGTH_MULTIPLIER = 1.5;

/** 守備側の戦力補正（本国の地の利） */
export const DEFENSE_MULTIPLIER = 1.2;

/** 戦闘の乱数幅（±） */
export const COMBAT_RANDOMNESS = 0.3;

/** 略奪成功時に属州 control が受けるダメージ */
export const RAID_CONTROL_DAMAGE = 15;

/** 略奪成功時に国庫が失う額 */
export const RAID_TREASURY_LOOT = 40;

/** 戦闘の優劣差に対する守備隊損耗係数 */
export const GARRISON_LOSS_FACTOR = 0.5;

/** 戦闘の優劣差に対する攻撃側損耗係数 */
export const ATTACKER_LOSS_FACTOR = 0.3;

/** Africa 喪失時に Italia の control が受ける恒久ペナルティ（穀物供給途絶） */
export const ITALIA_GRAIN_LOSS_PENALTY = 20;
