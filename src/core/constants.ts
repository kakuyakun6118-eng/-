// 数値定数はすべてここに集約する。

import type { Difficulty, DifficultySettings, Scenario } from './types';

/**
 * セーブデータの形式版。互換性のない変更をしたら上げる。
 * 2: 軍司令官（general）を追加。空で補える情報ではないため旧版は読めない
 * 3: 君主に名前（name）と後継者の名前候補（namePool）を追加
 * 4: シナリオ（scenario）と東ローマ・ペルシア（east / persia）を追加。
 *    空で補える情報ではないため旧版は読めない
 */
export const SAVE_VERSION = 4;

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

// 蛮族の要求（金・土地・称号）
/**
 * 属州に入った敵対勢力が、その年に要求を突きつける確率。
 * 0.3 では要求が絶え間なく、無視する遊び方の生存率が
 * 49% → 30% まで落ちて単なる難易度上げになっていた
 */
export const DEMAND_PROBABILITY = 0.15;
/** 金の要求額は戦力に比例する。強大な勢力ほど高く付く */
export const DEMAND_GOLD_PER_STRENGTH = 0.8;
/** 支配度がこれを下回った属州は、その土地そのものを要求される */
export const DEMAND_LAND_CONTROL_THRESHOLD = 45;
/** 土地を要求できない場合に、金ではなく称号を求める確率 */
export const DEMAND_TITLE_SHARE = 0.35;
/** 称号を認めた際の元老院支持の低下。蛮族に官位を与えたことへの反発 */
export const DEMAND_TITLE_SENATE_LOSS = 6;
/** 称号を認めた際の正統性の低下 */
export const DEMAND_TITLE_LEGITIMACY_LOSS = 3;
/**
 * 要求を突きつけたまま答えを得られない勢力の、攻撃側戦力への補正。
 *
 * 拒否の代償は「今年の戦闘が重くなる」で受ける。
 * 戦力の複利成長で罰する形にすると、飲んでも拒んでも損という
 * ただの難易度税になり、選択にならなかった（放置の成長率 0.07 で
 * 生存率が 52% → 29% に落ちた）
 */
export const DEMAND_REFUSAL_POWER_BONUS = 0.35;
/**
 * 答えを得られない勢力が定住に踏み切る支配度の上乗せ。
 *
 * 拒否の代償が「その年の戦闘が重い」だけだと、恒久的に資源を削る
 * 応諾のほうが常に損になり、拒否一択になる（計測では応諾26〜33%に
 * 対して拒否35%）。一時的な罰では恒久的な支払いに釣り合わない。
 * 要求を無視した土地はそのまま奪われうる、という形で釣り合わせる
 */
export const DEMAND_REFUSAL_SETTLE_CONTROL_BONUS = 15;
/**
 * 称号を認めて味方にした勢力の給金の割引率。
 * 相手が求めたのは金ではなく地位なので、雇うより安く付く。
 * これが無いとフォエデラティ契約に完全に劣り、選ぶ理由が消える
 */
export const DEMAND_TITLE_WAGE_DISCOUNT = 0.6;
/**
 * 金の要求を飲んだ勢力が失う戦力の割合。
 *
 * 引き揚げさせるだけでは、境外で毎年成長して数年後に戻ってくるので
 * 金を払う意味がほとんど無かった。金を受け取った軍は一部が散る、
 * という形にして、払った分だけ脅威の総量が恒久的に減るようにする
 */
export const DEMAND_GOLD_DISPERSAL_RATE = 0.3;

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

// ── マギステル・ミリトゥム（軍司令官） ────────────────

/**
 * 将軍の軍事能力の生成範囲。
 * 君主より上を広く取る。凡庸な皇帝の下でも名将が出うる、という
 * この時代の実態（スティリコ・アエティウス）を数値で表す
 */
export const GENERAL_ABILITY_ROLL_MIN = 4;
export const GENERAL_ABILITY_ROLL_MAX = 9;

/** 在職年数の範囲。任期を終えると自ら職を退く */
export const GENERAL_MIN_TERM = 8;
export const GENERAL_MAX_TERM = 28;

/**
 * 将軍の軍事能力1点あたり、戦闘の防御側戦力にかかる補正。
 * 君主の能力補正（ABILITY_MODIFIER_PER_POINT）と同じ形で、
 * ABILITY_NEUTRAL を基準に上下する
 */
export const GENERAL_DEFENSE_PER_POINT = 0.05;

/** 空位のあいだ防御側戦力にかかる罰。指揮官のいない軍は弱い */
export const GENERAL_VACANT_DEFENSE_PENALTY = 0.12;

/**
 * 有能な将軍が毎年削る正統性（ABILITY_NEUTRAL を超えた1点あたり）。
 *
 * 軍が皇帝ではなく将軍に従っている、という状態を既存のパラメータで表す。
 * 「強い将軍は帝国を守るが帝位を痩せさせる」というこの時代の構図が
 * ここで成立する
 */
export const GENERAL_LEGITIMACY_DRAIN_PER_POINT = 0.35;

/**
 * 将軍が持っていく戦勝の名声（ABILITY_NEUTRAL を超えた1点あたり）。
 *
 * 撃退で得られる legitimacy をこの割合だけ削る。名将の下では勝っても
 * 帝位は輝かない、という形にしないと「強い将軍を置く → 勝つ →
 * 正統性が回復する」で自己強化してしまい、取引にならなかった
 * （計測では名将を抱えても最終正統性が空位のときと同じ83だった）
 */
export const GENERAL_VICTORY_CREDIT_PER_POINT = 0.12;

/** 将軍の軍事能力1点あたり、簒奪者の確率に加算される値 */
export const GENERAL_USURPER_BONUS_PER_POINT = 0.02;

/** 任命の費用 */
export const GENERAL_APPOINT_COST = 80;

/**
 * 解任で失う野戦軍の割合。その将に従っていた兵が離れる。
 * スティリコ408年、アエティウス454年——除いた側が軍を失う
 */
export const GENERAL_DISMISS_ARMY_LOSS_RATE = 0.15;

/** 解任で回復する正統性 */
export const GENERAL_DISMISS_LEGITIMACY_GAIN = 8;

/** 将軍が簒奪を起こしたときに追加で失う野戦軍の割合 */
export const GENERAL_USURP_EXTRA_ARMY_LOSS = 0.1;

// ── 官職（プラエトリア長官・属州総督） ────────────────

/**
 * 官職の能力・野心の生成範囲。
 * 君主(3〜8)より少し広く取る。凡庸な皇帝の下に有能な官僚が並ぶ、
 * という軍司令官と同じ考え方
 */
export const OFFICIAL_ABILITY_ROLL_MIN = 3;
export const OFFICIAL_ABILITY_ROLL_MAX = 9;
export const OFFICIAL_AMBITION_ROLL_MIN = 1;
export const OFFICIAL_AMBITION_ROLL_MAX = 9;

/** 任命候補の人数。多すぎると選択が作業になるので3人 */
export const OFFICIAL_CANDIDATE_COUNT = 3;

// プラエトリア長官
export const PREFECT_APPOINT_COST = 100;
export const PREFECT_MIN_TERM = 10;
export const PREFECT_MAX_TERM = 28;
/**
 * 長官の能力1点あたり税収にかかる補正（ABILITY_NEUTRAL 基準）。
 * 徴税機構を握っているので税収に効く。軍事には一切効かない
 */
export const PREFECT_INCOME_PER_POINT = 0.03;
/** 空位のあいだ税収にかかる罰。徴税機構に頭がいない状態 */
export const PREFECT_VACANT_INCOME_PENALTY = 0.05;
/**
 * 長官の能力1点あたり、元老院支持の自然減にかかる軽減。
 * 貴族との折衝が職務なので、有能なら離反を抑えられる
 */
export const PREFECT_SENATE_DECAY_PER_POINT = 0.02;
/** 解任で回復する正統性。長官は軍を持たないので兵は離れない */
export const PREFECT_DISMISS_LEGITIMACY_GAIN = 3;

// 属州総督
export const GOVERNOR_APPOINT_COST = 30;
export const GOVERNOR_MIN_TERM = 12;
export const GOVERNOR_MAX_TERM = 32;
/** 総督の能力1点あたり、その属州の支配度の自然回復にかかる補正 */
export const GOVERNOR_CONTROL_RECOVERY_PER_POINT = 0.12;
/** 総督の能力1点あたり、その属州の守備隊の戦闘力にかかる補正 */
export const GOVERNOR_DEFENSE_PER_POINT = 0.04;
/** 空位の属州にかかる守備の罰 */
export const GOVERNOR_VACANT_DEFENSE_PENALTY = 0.06;

// ── 反乱 ──────────────────────────────────────────────

/**
 * 属州総督の反乱。
 *
 * 簒奪(checkUsurper)とは別口で、正統性が低い年に野心の高い総督が
 * 独立を図る。この時代の西ローマはガリアやブリタンニアで実際に
 * 何度も僭称帝が立っており、崩壊は中央からではなく属州から始まった。
 *
 * 正統性が閾値を下回っている年にだけ判定する。低正統性という
 * 既存の失敗経路を濃くするもので、無条件の追加リスクにはしない
 */
export const GOVERNOR_REVOLT_LEGITIMACY_THRESHOLD = 45;
export const GOVERNOR_REVOLT_BASE_PROBABILITY = 0.01;
/** 野心が ABILITY_NEUTRAL を超えた1点あたりの上乗せ */
export const GOVERNOR_REVOLT_AMBITION_PER_POINT = 0.012;
/** 属州が荒れているほど反乱しやすい。支配度がこれを下回ると上乗せ */
export const GOVERNOR_REVOLT_LOW_CONTROL_THRESHOLD = 50;
export const GOVERNOR_REVOLT_LOW_CONTROL_BONUS = 0.03;
/** 1属州あたりの反乱確率の上限 */
export const GOVERNOR_REVOLT_PROBABILITY_CAP = 0.12;
/** 反乱でその属州が失う支配度 */
export const GOVERNOR_REVOLT_CONTROL_LOSS = 25;
/** 反乱で総督に付いていく守備隊の割合 */
export const GOVERNOR_REVOLT_GARRISON_LOSS_RATE = 0.5;
export const GOVERNOR_REVOLT_LEGITIMACY_LOSS = 6;

/**
 * 皇帝の兄弟（傍系の一族）の挙兵。
 *
 * 成人した一族がいるのに帝位が揺らいでいる年に起きる。
 * 後継者がいることは継承危機を防ぐ利点だが、同時に
 * 帝位を狙う者を抱えることでもある、という取引にする
 */
export const BROTHER_REVOLT_LEGITIMACY_THRESHOLD = 40;
export const BROTHER_REVOLT_BASE_PROBABILITY = 0.03;
/** 成人した一族1人あたりの上乗せ */
export const BROTHER_REVOLT_PER_ADULT = 0.02;
export const BROTHER_REVOLT_PROBABILITY_CAP = 0.15;
/** 挙兵に付いていく野戦軍の割合 */
export const BROTHER_REVOLT_ARMY_LOSS_RATE = 0.18;
export const BROTHER_REVOLT_LEGITIMACY_LOSS = 10;

// ── 難易度 ────────────────────────────────────────────

export const DEFAULT_DIFFICULTY: Difficulty = 'standard';

/** 既定のシナリオ。史実（延命）がこのゲームの本編 */
export const DEFAULT_SCENARIO: Scenario = 'historical';

/**
 * 難易度ごとの補正倍率。
 * 中級(standard)はすべて 1.0 で、これまで調整してきたバランスが
 * そのまま中級になる。初級・上級はそこからの差分としてのみ定義する。
 *
 * 触る対象は「主題」の2つのジレンマに直結する3点と、
 * 史実展開の再現度の合計4点に絞る。
 * 循環の罠 → 税収と蛮族の圧力
 * 短期と長期の取引 → フォエデラティの給金要求の膨張率
 * 史実展開 → 有害な歴史イベントの発火確率と被害量
 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: {
    incomeMultiplier: 1.25,
    barbarianPowerMultiplier: 0.85,
    foederatiEscalationMultiplier: 0.6,
    // 史実よりかなり西ローマ有利。災厄はめったに起きず、起きても軽い
    historicalSeverityMultiplier: 0.3,
  },
  standard: {
    incomeMultiplier: 1,
    barbarianPowerMultiplier: 1,
    foederatiEscalationMultiplier: 1,
    // 史実より西ローマ有利
    historicalSeverityMultiplier: 0.6,
  },
  veteran: {
    incomeMultiplier: 0.85,
    barbarianPowerMultiplier: 1.15,
    foederatiEscalationMultiplier: 1.4,
    /*
     * 史実に近い。ただし 1.0 では史実の災厄が連鎖して生存率が1%まで
     * 落ち、上達が結果に反映されなくなるため僅かに緩めている。
     * 「史実通りに崩壊へ向かうが、極めて上手ければ稀に凌げる」水準
     */
    historicalSeverityMultiplier: 0.85,
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

/**
 * 修好。使者と贈り物を送って東との関係を戻す。
 *
 * 援軍要請(−12)と帝位の承認(−6)は関係を削る一方で、戻す手段が無かった。
 * 関係30を割ると援軍が撃てなくなるので、東帝国の欄が
 * 「3回使ったら終わり」の一方通行になっていた。
 *
 * 金額は「援軍要請との往復で儲からない」ことを条件に決める。
 * 関係12ぶんの回復に 100 × 12/8 = 150 かかるので、
 * 援軍の +200 に対する差益は 50 しかない。この差益のために
 * 行動枠を2.5回ぶん使うのは徴税強化(1枠で150以上)に明確に劣るため、
 * 無限に金を生む手にはならない
 */
export const EAST_IMPROVE_COST = 100;
export const EAST_IMPROVE_RELATIONS_GAIN = 8;

// ── 統一シナリオ: 東ローマとの戦争 ────────────────────

/**
 * 宣戦の代償。ローマ人がローマ人と戦うことへの反発。
 * 正統性と元老院支持を先払いさせ、統一を「安い拡大」にしない
 */
export const EAST_DECLARE_WAR_LEGITIMACY_LOSS = 12;
export const EAST_DECLARE_WAR_SENATE_LOSS = 10;

/** 交戦中は毎年これだけ正統性が余分に減る。同胞と戦い続ける負担 */
export const EAST_WAR_LEGITIMACY_DRAIN = 0.8;

/** 東方へ侵攻するとき、遠征に振り向ける野戦軍の割合 */
export const EAST_INVADE_ARMY_SHARE = 0.7;
/** 遠征の損耗。本国の防衛派遣(0.04)より重い */
export const EAST_INVADE_ATTRITION_RATE = 0.06;
/** 東の野戦軍が属州防衛に加える割合 */
export const EAST_DEFENSE_ARMY_SHARE = 0.25;
/** 侵攻に勝った年に東方属州の支配度が受けるダメージ */
export const EAST_INVADE_CONTROL_DAMAGE = 35;
/** 征服した直後の支配度。奪ったばかりの土地は言うことを聞かない */
export const EAST_CONQUEST_CONTROL = 35;
/** 戦闘の優劣差に対する東の軍の損耗係数 */
export const EAST_ARMY_LOSS_FACTOR = 0.35;
/** 同じく西の野戦軍の損耗係数 */
export const WEST_ARMY_LOSS_FACTOR = 0.3;
/** 東の軍が毎年回復する割合 */
export const EAST_ARMY_GROWTH_RATE = 0.02;
/** 交戦中に東が攻め返してくる確率 */
export const EAST_COUNTERATTACK_PROBABILITY = 0.35;

/** 講和できるようになるまでの最低交戦年数。開戦即講和を防ぐ */
export const EAST_PEACE_MIN_WAR_YEARS = 3;
/** 講和した時点の東との関係 */
export const EAST_PEACE_RELATIONS = 20;

// ── 統一シナリオ: サーサーン朝ペルシア ────────────────

/**
 * ローマ同士が交戦している年に、ペルシアが介入を始める確率。
 * 統一を狙うほどペルシアを呼び込む、という取引にする
 */
export const PERSIA_INTERVENTION_PROBABILITY = 0.4;
/**
 * 介入までに要するローマ内戦の年数。
 *
 * 開戦の翌年から動けるようにすると、西が東方属州を1つ取る前に
 * ペルシアが東を食べ尽くしてしまい、統一が成立しなかった
 * （計測では4州すべてを取れた局が1%）。
 * 「内戦が長引いたのを見て動く」形にして、緒戦の窓を開ける
 */
export const PERSIA_MIN_WAR_YEARS = 4;
/** 介入後、ペルシアが毎年強くなる割合 */
export const PERSIA_GROWTH_RATE = 0.008;
/** 介入後、ペルシアが東方属州を攻める確率 */
export const PERSIA_ATTACK_PROBABILITY = 0.15;
/** ペルシアが攻撃に振り向ける戦力の割合 */
export const PERSIA_ATTACK_SHARE = 0.45;
/** ペルシアが属州防衛に振り向ける戦力の割合 */
export const PERSIA_DEFENSE_SHARE = 0.22;
/** ペルシアの攻撃が通った年の支配度ダメージ */
export const PERSIA_ATTACK_CONTROL_DAMAGE = 8;
/** この支配度を下回った東方属州はペルシアに奪われる */
export const PERSIA_SEIZE_CONTROL_THRESHOLD = 20;
/** 戦闘の優劣差に対するペルシアの損耗係数 */
export const PERSIA_LOSS_FACTOR = 0.45;
/** 属州を1つ奪うたびにペルシアが得る戦力 */
export const PERSIA_SEIZE_STRENGTH_GAIN = 25;
/**
 * ペルシアが握った属州の支配度。
 *
 * 征服直後の支配度(EAST_CONQUEST_CONTROL)のままにすると、
 * 一度の戦闘で取り返せてしまい関門にならない。
 * ペルシアの統治は根を張っている、という形で2勝ぶんの厚みを持たせる
 */
export const PERSIA_HOLD_CONTROL = 70;
