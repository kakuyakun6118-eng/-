// 数値定数はすべてここに集約する。

import type { Difficulty, DifficultySettings } from './types';

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

/**
 * 属州収入に対する徴税効率。
 * 元老院の非協力による減収（SENATE_INCOME_FLOOR）を織り込んだ値
 */
export const TAX_RATE = 0.72;

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

/** 境外の勢力がこの戦力未満なら侵入を試みない（初期戦力の差で侵入時期が自然に分散する） */
export const MIN_STRENGTH_TO_ADVANCE = 55;

/** 境外の勢力が毎ターン帝国領へ侵入を試みる確率 */
export const ADVANCE_PROBABILITY = 0.3;

/** 境外で待機している勢力の戦力成長率（ターンあたり） */
export const EXTERIOR_GROWTH_RATE = 0.05;

/** 属州の control がこれを下回ると定住されうる */
export const SETTLE_CONTROL_THRESHOLD = 30;

/** 定住には守備隊のこの倍率以上の戦力が必要 */
export const SETTLE_STRENGTH_MULTIPLIER = 1.5;

/** 守備側の戦力補正（本国の地の利） */
export const DEFENSE_MULTIPLIER = 1.2;

/** 野戦軍のうち、1回の戦闘の防衛に振り向けられる戦力の割合 */
export const FIELD_ARMY_DEFENSE_SHARE = 0.2;

/** 戦闘の乱数幅（±） */
export const COMBAT_RANDOMNESS = 0.3;

/** 略奪成功時に属州 control が受けるダメージ */
export const RAID_CONTROL_DAMAGE = 8;

/** 略奪成功時に国庫が失う額 */
export const RAID_TREASURY_LOOT = 20;

/** 戦闘の優劣差に対する守備隊損耗係数 */
export const GARRISON_LOSS_FACTOR = 0.3;

/** 撃退に成功したターンの守備隊損耗係数（敗北時より軽い） */
export const GARRISON_LOSS_FACTOR_ON_VICTORY = 0.15;

/** 戦闘の優劣差に対する攻撃側損耗係数 */
export const ATTACKER_LOSS_FACTOR = 0.4;

/** フォエデラティが駐屯先属州の防衛に加える戦力の割合 */
export const FOEDERATI_DEFENSE_SHARE = 0.6;

/** Africa 喪失時に Italia の control が受ける恒久ペナルティ（穀物供給途絶） */
export const ITALIA_GRAIN_LOSS_PENALTY = 20;

// ── パラメータの上下限 ────────────────────────────────

export const MIN_CONTROL = 0;
export const MAX_CONTROL = 100;
export const MIN_TAX_BASE = 0;
export const MAX_TAX_BASE = 100;
export const MIN_LEGITIMACY = 0;
export const MAX_LEGITIMACY = 100;
export const MIN_SENATE_SUPPORT = 0;
export const MAX_SENATE_SUPPORT = 100;
export const MIN_EAST_RELATIONS = 0;
export const MAX_EAST_RELATIONS = 100;
export const MIN_FOEDERATI_LOYALTY = 0;
export const MAX_FOEDERATI_LOYALTY = 100;

// ── 支配度・税基盤の更新（コアループ ステップ6） ──────

/** 敵勢力のいない属州が毎ターン回復する control */
export const CONTROL_RECOVERY_PER_TURN = 4;

/** 略奪1回につき恒久的に失われる taxBase */
export const RAID_TAX_BASE_LOSS = 0.6;

/** 蛮族1勢力の定住につき恒久的に失われる taxBase */
export const SETTLE_TAX_BASE_LOSS = 7;

/**
 * 元老院の非協力が徴税に与える影響の下限。
 * senateSupport が0でもこの割合の収入は得られる
 */
export const SENATE_INCOME_FLOOR = 0.55;

/**
 * 元老院支持の自然減。弱体化する宮廷から貴族が離れていく。
 * これがないと senateSupport は増税などが発火しない限り不動で、
 * domestic_appease_senate が発火条件に到達しない死んだ選択肢になる
 */
export const SENATE_SUPPORT_NATURAL_DECAY = 0.3;

// ── 正統性（コアループ ステップ7） ────────────────────

/** 属州の control が0に落ちた際の正統性低下 */
export const LEGITIMACY_LOSS_PER_PROVINCE_LOST = 10;

/** 蛮族の定住を許した際の正統性低下 */
export const LEGITIMACY_LOSS_PER_SETTLEMENT = 5;

/** 侵攻を撃退した際の正統性上昇 */
export const LEGITIMACY_GAIN_PER_VICTORY = 2;

/**
 * 476年到達時にこれを下回っていると、軍と属州が残っていても
 * 「名前だけの傀儡国家」として崩壊扱いにする
 */
export const SURVIVAL_MIN_LEGITIMACY = 20;

/** これを下回ると簒奪者イベントの判定が始まる */
export const USURPER_LEGITIMACY_THRESHOLD = 25;

/** 閾値を下回っているターンに簒奪者が現れる確率 */
export const USURPER_PROBABILITY = 0.25;

/** 簒奪未遂で失われる野戦軍の割合 */
export const USURPER_ARMY_LOSS_RATE = 0.15;

/** 簒奪未遂による正統性低下 */
export const USURPER_LEGITIMACY_LOSS = 8;

// ── フォエデラティの給金と忠誠 ────────────────────────

/** 給金を支払えたターンの忠誠回復 */
export const FOEDERATI_LOYALTY_RECOVERY = 4;

/** 給金を支払えなかったターンの忠誠低下 */
export const FOEDERATI_LOYALTY_DECAY_UNPAID = 14;

// ── プレイヤーアクション ──────────────────────────────

/** 1ターンに選べるアクション数の上限 */
export const MAX_ACTIONS_PER_TURN = 2;

// 交渉
/** 貢納を受けた勢力の忠誠上昇 */
export const TRIBUTE_LOYALTY_GAIN = 5;
export const MARRIAGE_COST = 120;
export const MARRIAGE_LOYALTY_GAIN = 10;
export const MARRIAGE_LEGITIMACY_LOSS = 3;

// 雇用（フォエデラティ契約）
export const FOEDERATI_HIRE_COST = 60;
/** 給金は勢力の戦力に比例する。強力な勢力を雇えばそれだけ高くつく */
export const FOEDERATI_DEMAND_PER_STRENGTH = 0.5;
/**
 * 契約が続く限り給金の要求は毎ターン膨らむ。
 * 「今日を凌ぐ判断が、10年後の帝国を殺す」構造の中核。
 * 複利なので81ターンで約2.6倍に達する（これ以上大きいと発散する）
 */
export const FOEDERATI_DEMAND_ESCALATION = 0.012;
/**
 * 駐屯するフォエデラティ1勢力が毎ターン恒久的に削る税基盤。
 * 給金を払い続けても土地は荒れ、税収基盤は戻らない
 */
export const FOEDERATI_TAX_BASE_DRAIN = 0.12;
export const FOEDERATI_HIRE_LEGITIMACY_LOSS = 2;

// 軍事
/** 派遣先属州の防衛に振り向けられる野戦軍の割合 */
export const DEPLOY_ARMY_DEFENSE_SHARE = 0.5;
/** 派遣による野戦軍の損耗率 */
export const DEPLOY_ATTRITION_RATE = 0.04;
export const DEFEND_COST = 40;
/** 6 では戦闘損耗ですぐ溶けて元が取れず、入れると生存率が下がっていた */
export const DEFEND_GARRISON_GAIN = 10;
export const CONSCRIPT_COST = 150;
export const CONSCRIPT_ARMY_GAIN = 15;
export const CONSCRIPT_SENATE_LOSS = 5;

// 内政
/** 徴税強化で得られる追加収入（通常収入に対する倍率） */
export const RAISE_TAXES_INCOME_MULTIPLIER = 0.5;
export const RAISE_TAXES_SENATE_LOSS = 8;
export const RAISE_TAXES_CONTROL_LOSS = 2;
export const REORGANIZE_COST = 60;
/**
 * 軍の再編は兵を生み出さず、属州の守備隊から野戦軍へ移すだけの
 * ゼロサムな再配分にする。各属州の garrison からこの割合を引き抜く。
 * 守備隊が尽きれば得られる兵も尽きるため、金がある限り毎ターン
 * 撃ち続けて兵を無限に増やすことができなくなる
 */
export const REORGANIZE_GARRISON_DRAW_RATE = 0.2;
/** 再配分に伴う損失。引き抜いた兵の全部が野戦軍にはならない */
export const REORGANIZE_TRANSFER_EFFICIENCY = 0.9;
export const APPEASE_SENATE_GAIN = 12;
export const APPEASE_SENATE_LEGITIMACY_GAIN = 4;
/** 免税特権の追認による恒久的な税基盤の損失 */
export const APPEASE_SENATE_TAX_BASE_LOSS = 2;

// ── 難易度 ────────────────────────────────────────────

export const DEFAULT_DIFFICULTY: Difficulty = 'standard';

/**
 * 難易度ごとの補正倍率。
 * 中級(standard)はすべて 1.0 で、これまで調整してきたバランスが
 * そのまま中級になる。初級・上級はそこからの差分としてのみ定義する。
 *
 * 触る対象は「主題」の2つのジレンマに直結する3点に絞る。
 * 循環の罠 → 税収と蛮族の圧力
 * 短期と長期の取引 → フォエデラティの給金要求の膨張率
 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: {
    incomeMultiplier: 1.25,
    barbarianPowerMultiplier: 0.85,
    foederatiEscalationMultiplier: 0.6,
  },
  standard: {
    incomeMultiplier: 1,
    barbarianPowerMultiplier: 1,
    foederatiEscalationMultiplier: 1,
  },
  veteran: {
    incomeMultiplier: 0.85,
    barbarianPowerMultiplier: 1.15,
    foederatiEscalationMultiplier: 1.4,
  },
};

// ── 王朝システム ──────────────────────────────────────

export const MIN_ABILITY = 1;
export const MAX_ABILITY = 10;

/**
 * 能力の生成範囲。極端な君主が出ないよう MIN/MAX より内側に絞る。
 * 生成される能力はこの範囲、設定からの変更は MIN/MAX まで許す。
 * 「名君と暗君のガチャ」は歴史のダイナミズムとして残す。
 * 分散の主因は能力ではなく継承イベントであることが計測で判明した
 * ため (能力を全君主5に固定しても変動係数は 1.01→1.06 と不変)、
 * 範囲を狭めても再現性は上がらない
 */
export const ABILITY_ROLL_MIN = 3;
export const ABILITY_ROLL_MAX = 8;

/**
 * 補正倍率の中心となる能力値。この値で倍率が 1.0 になる。
 * 平均的な君主のとき既存の数値バランスがそのまま維持される
 */
export const ABILITY_NEUTRAL = 5;

/**
 * 能力1あたりの補正幅。ABILITY_NEUTRAL からの差にこれを掛ける。
 * 能力1〜10で概ね ±30% の揺れに収まる
 */
export const ABILITY_MODIFIER_PER_POINT = 0.06;

// 寿命
export const MIN_LIFESPAN = 35;
export const MAX_LIFESPAN = 72;
/** 即位時の年齢の範囲 */
export const MIN_ACCESSION_AGE = 16;
export const MAX_ACCESSION_AGE = 40;
/** 継承者が成人と見なされる年齢 */
export const ADULT_AGE = 16;
/**
 * 最低在位年数。極端に短い連続交代を避けるため、
 * 即位からこの年数が経つまでは寿命・暗殺のどちらでも死なない
 */
export const MIN_REIGN_YEARS = 4;

// 暗殺
/** legitimacy が最大のときの暗殺確率 */
export const ASSASSINATION_BASE_PROBABILITY = 0.005;
/** legitimacy が0のときに加算される暗殺確率 */
export const ASSASSINATION_MAX_BONUS = 0.06;

// 継承
/** 成人した嫡子が継いだときの正統性低下 */
export const SUCCESSION_LEGITIMACY_LOSS_HEIR = 3;
/** 継承危機（継承者がいない）ときの正統性低下 */
export const SUCCESSION_LEGITIMACY_LOSS_CRISIS = 18;
/** 継承危機が簒奪者確率を上げている年数。毎ターン1減って自然に消える */
export const SUCCESSION_CRISIS_DURATION = 5;
/** 継承危機中に簒奪者確率へ加算される値 */
export const SUCCESSION_CRISIS_USURPER_BONUS = 0.2;
/**
 * 継承による正統性低下の下限。
 * 「正統性低下→暗殺→継承危機→さらに低下」の死のスパイラルを
 * 継承だけで底まで落とさないための減衰装置
 */
export const SUCCESSION_LEGITIMACY_FLOOR = 15;
/** 簒奪者確率の上限。継承危機と低正統性が重なっても発散させない */
export const USURPER_PROBABILITY_CAP = 0.5;

/**
 * 正統性の自然減。統治能力が高いほど小さくなる。
 * 何もしなければ権威は摩耗していく
 */
export const LEGITIMACY_NATURAL_DECAY = 0.5;
/** 君主が子をもうける年あたりの確率 */
export const CHILD_BIRTH_PROBABILITY = 0.12;
/** 抱えられる継承候補の上限 */
export const MAX_DYNASTY_MEMBERS = 6;

// 婚姻外交
/** 蛮族との婚姻が成立する確率（交渉能力で補正される） */
export const MARRIAGE_BARBARIAN_SUCCESS_BASE = 0.75;
/** 東ローマとの婚姻が成立する確率。帝室との縁組なので難しい */
export const MARRIAGE_EAST_SUCCESS_BASE = 0.35;
/** 東ローマとの婚姻を申し込める最低の eastRelations */
export const MARRIAGE_EAST_MIN_RELATIONS = 50;
/** 蛮族との婚姻の即時効果 */
export const MARRIAGE_BARBARIAN_LOYALTY_GAIN = 12;
export const MARRIAGE_BARBARIAN_SENATE_LOSS = 8;
/** 東ローマとの婚姻の即時効果 */
export const MARRIAGE_EAST_RELATIONS_GAIN = 15;
export const MARRIAGE_EAST_LEGITIMACY_GAIN = 8;
/** 子が生まれたときに追加で発生する効果 */
export const MARRIAGE_HEIR_BORN_LOYALTY_GAIN = 10;
export const MARRIAGE_HEIR_BORN_EAST_RELATIONS_GAIN = 10;
/** 混血の後継者が即位したときの正統性への負の補正 */
export const MIXED_BLOOD_LEGITIMACY_PENALTY = 6;

// 東帝国
/** 援軍を要請できる最低の eastRelations */
export const EAST_AID_MIN_RELATIONS = 30;
export const EAST_AID_TREASURY_GAIN = 200;
export const EAST_AID_ARMY_GAIN = 10;
export const EAST_AID_RELATIONS_LOSS = 12;
export const EAST_TITLE_COST = 80;
export const EAST_TITLE_LEGITIMACY_GAIN = 10;
export const EAST_TITLE_RELATIONS_LOSS = 6;
