/*
 * 数値はすべてここに置く。計算式の中に生の数を書かない。
 *
 * 調整の指針は「描きたい主題」の2つのジレンマに奉仕すること。
 *   1. 循環の罠 — 兵を養うには戸口が要る。戸口を守るには兵が要る。
 *      州をひとつ失うと兵が縮み、兵が縮むと次の州を失う
 *   2. 短期と長期の取引 — 胡族を義従として雇えば戦線は安く埋まる。
 *      だが給が絶えれば寝返り、建国を許せば戸口と天命が削れていく
 */
import type { Difficulty, DifficultyModifiers, ProvinceId } from './types';

// ── 年代 ──────────────────────────────────────────────

/** 291年。八王の乱の発端（賈后が楊駿を誅す） */
export const START_YEAR = 291;

/**
 * 589年。隋が陳を滅ぼして天下を統一した年。
 *
 * **この年までに統一できなければ、統一するのは隋のほうになる。**
 * 勝敗の条件そのものがこのゲームの題名になっている
 */
export const ENDING_YEAR = 589;

/** 1ターンに選べる行動の数。何を諦めるかを選ばせることが本体 */
export const MAX_ACTIONS_PER_TURN = 2;

// ── 収入と支出 ────────────────────────────────────────

/** 州の収入 = control × baseTax × これ */
export const TAX_RATE = 0.18;
/** 戸口が税収に掛かる度合い。taxBase 100 を基準にする */
export const TAX_BASE_REFERENCE = 100;
/** 中軍1あたりの維持費。最大の支出 */
export const ARMY_UPKEEP = 1.15;
/** 州兵1あたりの維持費。中軍より安い */
export const GARRISON_UPKEEP = 0.35;
/** 宮廷費。年ごとに必ず出ていく */
export const COURT_COST = 24;
/** 都を保っているあいだの威信。天命の自然減を和らげる */
export const CAPITAL_MANDATE_BONUS = 0.5;

/** 統治能力1あたり、税収に掛かる補正 */
export const ADMIN_INCOME_PER_POINT = 0.035;
/** 録尚書事の能力1あたり、税収に掛かる補正 */
export const CHANCELLOR_INCOME_PER_POINT = 0.022;

/** 国庫が負のとき、不足1あたり中軍から脱走する兵 */
export const DESERTION_PER_DEFICIT = 0.09;
/** 脱走が起きた年に落ちる天命 */
export const DESERTION_MANDATE_LOSS = 2.5;

// ── 支配度 ────────────────────────────────────────────

/** 敵のいない州が年ごとに回復する支配度 */
export const CONTROL_RECOVERY = 2.2;
/** 刺史がいる州の回復に掛かる補正 */
export const INSPECTOR_RECOVERY_PER_POINT = 0.09;
/** 支配度の上限 */
export const CONTROL_MAX = 100;
/** 都から遠い州（南渡後の北の州など）は回復しない */
export const CONTROL_RECOVERY_MIN_CONTROL = 1;

/**
 * 開発。朝廷が保っている州の戸口の豊かさが年ごとに伸びる。
 *
 * 南を速くするのは史実そのままで、この時代の最大の経済的事実。
 * 都を南に置いているあいだはさらに速い（衣冠南渡で戸が移るため）
 */
export const DEVELOPMENT_RATE_NORTH = 0.0016;
export const DEVELOPMENT_RATE_SOUTH = 0.0042;
/** 都を置いている側の地域に加わる伸び */
export const DEVELOPMENT_CAPITAL_BONUS = 0.0022;

/** 戸口の上限。土断で戻せるのはここまで */
export const TAX_BASE_MAX = 100;
/**
 * 戸口の自然な戻り。逃散した戸が年ごとに帳簿へ戻ってくる。
 *
 * これが無いと、一度 0 まで削られた戸口は屯田と土断でしか戻らず、
 * 実測では402年から589年までずっと 0 のまま張り付いた。
 * 戻りは失う量よりずっと小さく取る（州をひとつ失えば 2.5 減り、
 * 取り返すには十年近くかかる）
 */
export const TAX_BASE_RECOVERY = 0.28;
/** 州を失うと恒久的に減る戸口 */
export const TAX_BASE_LOSS_PER_PROVINCE = 2.5;
/** 胡族が建国すると恒久的に減る戸口 */
export const TAX_BASE_LOSS_PER_KINGDOM = 2.5;

// ── 戦闘解決 ──────────────────────────────────────────

/** 守る側に掛かる下駄。攻める側は数がそのまま要る */
export const DEFENSE_MULTIPLIER = 1.35;
/** 君主の軍事能力1あたり、防御側戦力に掛かる補正 */
export const SOVEREIGN_MILITARY_PER_POINT = 0.028;
/** 都督の能力1あたり、防御側戦力に掛かる補正 */
export const MARSHAL_MILITARY_PER_POINT = 0.036;
/** 都督が空位のときの防御側の目減り */
export const MARSHAL_VACANT_PENALTY = 0.88;
/** 刺史の能力1あたり、その州の守備隊の戦闘力に掛かる補正 */
export const INSPECTOR_DEFENSE_PER_POINT = 0.03;
/** 中軍を差し向けた州に加わる戦力の割合 */
export const DEPLOY_SHARE = 0.55;
/** 派遣した年に中軍が失う損耗 */
export const DEPLOY_ATTRITION = 0.035;
/** 攻め勝ったときに削られる支配度の係数 */
export const CONTROL_LOSS_PER_ADVANTAGE = 26;
/** 守り勝ったときに敵が失う戦力の割合 */
export const FOE_REPULSE_LOSS = 0.18;
/** 撃退で得る天命 */
export const REPULSE_MANDATE_GAIN = 1.6;
/** 都督が有能なほど、撃退の功は将のものになって天命に入らない */
export const MARSHAL_GLORY_PER_POINT = 0.09;

// ── 城攻め ────────────────────────────────────────────

/**
 * 支配度が尽きたあと、城の耐久を削る係数。
 *
 * 州は支配度が0になった時点では落ちない。そこから城攻めが始まり、
 * 耐久が尽きてはじめて落ちる。洛陽が一年で陥ちないための緩衝でもある
 */
export const WALL_LOSS_PER_ADVANTAGE = 78;
/** 囲まれていない年に戻る耐久 */
export const WALL_REPAIR = 1.6;
/** 「守りを固める」で戻る耐久 */
export const WALL_REPAIR_ACTION = 18;
/** 刺史の能力1あたり、修復に掛かる補正 */
export const WALL_REPAIR_PER_POINT = 0.06;

// ── 胡族 ──────────────────────────────────────────────

/** 塞外にいる勢力が年ごとに育つ率 */
export const EXTERIOR_GROWTH_RATE = 0.028;
/** 塞内に住む勢力が年ごとに育つ率。すでに垣の内なので育ちが速い */
export const INTERIOR_GROWTH_RATE = 0.034;
/** 掠めるだけの民が塞外で育てる上限。MIN_STRENGTH_TO_ADVANCE より必ず大きく取る */
export const RAIDER_MAX_STRENGTH = 72;
/** 州へ攻め入るのに要る最低戦力 */
export const MIN_STRENGTH_TO_ADVANCE = 34;
/** 頂点を過ぎた勢力が年ごとに崩れる率 */
export const FACTION_COLLAPSE_DECAY_RATE = 0.11;
/** 州に居座る勢力が要求を突きつける確率 */
export const DEMAND_PROBABILITY = 0.34;
/** 侵攻の基礎確率。天命と帰順が低いほど上がる */
export const INVASION_BASE_PROBABILITY = 0.3;
/** 建国（自立）に踏み切る支配度の閾値。これを割った州で国を建てる */
export const KINGDOM_CONTROL_THRESHOLD = 16;
/** 建国に踏み切る確率 */
export const KINGDOM_PROBABILITY = 0.42;

/**
 * 帝を称するのに要る州の数。野心で決まる。
 *
 * **野心が高ければ一州で称し、低くても三州を得れば必ず称する。**
 * 劉淵は并州の一角で漢王を称し、石勒も襄国ひとつから趙王を名乗った
 */
export function provincesToProclaim(ambition: number): number {
  if (ambition >= 9) return 1;
  if (ambition >= 6) return 2;
  return 3;
}

/** 胡族が帝を称した年に朝廷が失う天命 */
export const PROCLAIM_MANDATE_LOSS = 9;

/** 義従胡の給。戦力に比例する */
export const AUXILIARY_PAY_PER_STRENGTH = 0.42;
/** 年ごとに膨らむ給の率。抱え続けるほど高くつく */
export const AUXILIARY_ESCALATION = 0.045;
/** 給を払えた年に上がる帰順 */
export const AUXILIARY_LOYALTY_GAIN = 3.5;
/** 給を払えなかった年に落ちる帰順 */
export const AUXILIARY_LOYALTY_LOSS = 14;
/** 帰順がこれを割ると義従胡が寝返る */
export const AUXILIARY_DEFECT_THRESHOLD = 25;
/** 義従胡が防衛に加える戦力の割合 */
export const AUXILIARY_DEFENSE_SHARE = 0.45;

/** 歳幣で買える和平。相手の戦力1あたりの費用 */
export const TRIBUTE_COST_PER_STRENGTH = 1.5;
/** 人望1あたり、歳幣の費用に掛かる割引 */
export const CHARISMA_TRIBUTE_DISCOUNT = 0.022;
/** 歳幣を飲ませたときに散る相手の戦力 */
export const TRIBUTE_STRENGTH_LOSS = 0.12;

/** 郷里への遠征で守りに立つ、その勢力の戦力の割合 */
export const HOMELAND_DEFENSE_SHARE = 0.5;
/** 郷里をひとつ奪うごとに固くなる他勢力の加勢 */
export const COALITION_RALLY_PER_HOMELAND = 0.22;
/** 遠征に投じる中軍の割合 */
export const EXPEDITION_ARMY_SHARE = 0.6;
/** 遠征に勝ったときに得る天命 */
export const EXPEDITION_MANDATE_GAIN = 5;

// ── 宗室の諸王 ────────────────────────────────────────

/** 挙兵の基礎確率。毎年判定する */
export const PRINCE_REVOLT_BASE = 0.0035;
/** 野心1あたり、挙兵の確率に乗る倍率 */
export const PRINCE_AMBITION_PER_POINT = 0.3;
/** 帰順がこれを下回ると挙兵の確率が押し上がる */
export const PRINCE_LOYALTY_THRESHOLD = 55;
/** 帰順0のときの押し上げの最大 */
export const PRINCE_LOYALTY_PRESSURE_MAX = 5.5;
/** 挙兵した王がその州から引き抜く守備隊の割合 */
export const PRINCE_REVOLT_GARRISON_SHARE = 0.55;
/** 挙兵した王が中軍から引き抜く割合。宗室に従う兵がいる */
export const PRINCE_REVOLT_ARMY_SHARE = 0.1;
/** 挙兵で落ちる天命 */
export const PRINCE_REVOLT_MANDATE_LOSS = 6;

/** 鎮撫。差し出すものと得るもの */
export const PACIFY_COST = 95;
export const PACIFY_LOYALTY_GAIN = 13;
/** 削藩。兵を召し上げるが帰順を失う */
export const CURTAIL_ARMY_GAIN = 0.35;
export const CURTAIL_LOYALTY_LOSS = 16;
/** 誅殺。挙兵の芽を摘むが、宗室と天命を失う */
export const EXECUTE_MANDATE_LOSS = 7;
export const EXECUTE_LOYALTY_LOSS = 22;
/** 兵権を委ねる。州は固くなるが野心が育つ */
export const EMPOWER_GARRISON_GAIN = 14;
export const EMPOWER_AMBITION_GAIN = 2;
export const EMPOWER_LOYALTY_GAIN = 6;

/**
 * 挙兵した王が都へ攻め上る確率。
 *
 * 都を陥とせばその王が帝位に即く。趙王倫が実際にそうしたように、
 * **宗室の乱は王朝の外へ出ない** — 局は続き、帝が入れ替わる
 */
export const PRINCE_MARCH_PROBABILITY = 0.35;
/** 王が即位したときに戻る天命 */
export const PRINCE_ENTHRONE_MANDATE = 44;
/** 王が即位したときに失う士族の支持 */
export const PRINCE_ENTHRONE_GENTRY_LOSS = 14;

/** 討伐に投じる中軍の割合 */
export const SUPPRESS_ARMY_SHARE = 0.65;
/** 討伐に勝ったときに得る天命 */
export const SUPPRESS_MANDATE_GAIN = 4;

// ── 内政 ──────────────────────────────────────────────

/** 増税。その年の収入に乗る倍率と、失う士族の支持 */
export const RAISE_TAXES_MULTIPLIER = 1.45;
export const RAISE_TAXES_GENTRY_LOSS = 11;
export const RAISE_TAXES_MANDATE_LOSS = 2;

/**
 * 軍の再編。兵は生まれない。州兵から中軍へ移す再配分。
 * 兵力は保てるが州が痩せてスコアは落ちる、という取引にする
 */
export const REORGANIZE_GARRISON_SHARE = 0.16;
export const REORGANIZE_COST = 45;

/** 免税特権の追認。士族の機嫌を取る三手のひとつ */
export const PRIVILEGE_TAX_BASE_LOSS = 2;
export const PRIVILEGE_GENTRY_GAIN = 12;
export const PRIVILEGE_MANDATE_GAIN = 4;
/** 清談の会を催す。金を払う */
export const CONVERSATION_COST = 90;
export const CONVERSATION_GENTRY_GAIN = 9;
export const CONVERSATION_MANDATE_GAIN = 6;
/** 郷品を授ける（九品官人法の上位）。その年の栄誉は士族のものになる */
export const GRANT_RANK_GENTRY_GAIN = 16;
export const GRANT_RANK_MANDATE_LOSS = 5;

/** 流民を屯田に入れる。戸口を戻せる手のひとつ */
export const SETTLE_COST = 110;
export const SETTLE_GENTRY_LOSS = 8;
export const SETTLE_TAX_BASE_GAIN = 6;

/**
 * 土断。僑州僑郡の戸を土地に結び直す。
 * 南渡したあとにだけ選べる、戸口を大きく戻す手
 */
export const REGISTER_TAX_BASE_GAIN = 11;
export const REGISTER_GENTRY_LOSS = 15;
export const REGISTER_COST = 70;

/** 徴募。金で兵を買う */
export const CONSCRIPT_COST = 130;
export const CONSCRIPT_TROOPS = 14;
export const CONSCRIPT_TAX_BASE_LOSS = 1;

/** 州で募兵する。豊かで落ち着いた州ほど兵が出る */
export const PROVINCE_RECRUIT_COST = 70;
export const PROVINCE_RECRUIT_PER_BASE_TAX = 0.0011;
export const PROVINCE_RECRUIT_GARRISON_SHARE = 0.35;
export const PROVINCE_RECRUIT_CONTROL_LOSS = 5;

/** 州の防衛を固める */
export const DEFEND_GARRISON_GAIN = 10;
export const DEFEND_COST = 55;

/** 遷都。都を移す。天命を失うが、迫られた都から逃れられる */
export const MOVE_CAPITAL_MANDATE_LOSS = 6;
export const MOVE_CAPITAL_COST = 140;

// ── 自然減 ────────────────────────────────────────────

/** 天命の自然減。何もしなければ年ごとに削れていく */
export const MANDATE_DECAY = 1.0;
/** 統治能力1あたり、天命の自然減を和らげる */
export const ADMIN_DECAY_RELIEF = 0.055;
/** 都督が有能なほど、天命は余分に削れる。実権が将に移るため */
export const MARSHAL_DECAY_PER_POINT = 0.07;
/** 士族の支持の自然減 */
export const GENTRY_DECAY = 1.4;
/** 録尚書事の能力1あたり、士族の支持の自然減を和らげる */
export const CHANCELLOR_GENTRY_RELIEF = 0.1;
/** 宗室の帰順の自然減 */
export const PRINCE_LOYALTY_DECAY = 1.1;
/** 人望1あたり、宗室と胡族の帰順の自然減を和らげる */
export const CHARISMA_LOYALTY_RELIEF = 0.09;

// ── 簒奪と禅譲 ────────────────────────────────────────

/** 簒奪の判定を始める天命の閾値 */
export const USURPATION_THRESHOLD = 34;
/** 簒奪の基礎確率 */
export const USURPATION_BASE = 0.012;
/** 都督が有能なほど簒奪の確率は上がる。在職中なら簒奪者は都督本人 */
export const USURPATION_MARSHAL_PER_POINT = 0.012;
/**
 * 禅譲。天命が尽きた朝廷から、実権を握る者へ位が渡る。
 *
 * **これは敗北ではない。** 晋から宋へ、宋から斉へと位は渡り続けた。
 * 王朝の号が替わり、天命が戻り、局は続く。
 * 六朝の形をそのまま仕組みにしている
 */
export const ABDICATION_MANDATE_RESTORE = 62;
/**
 * 位が渡ってから次に渡るまでの、最も短い年数。
 *
 * これが無かったときは1局に58回も王朝が替わった。受禅で戻る天命が
 * 十年で閾値まで落ち、そのたびに次の実力者が位を受けるためで、
 * 士族の支持と宗室の帰順が永久に0に張り付いた。
 * 南朝の四代（宋斉梁陳）はいずれも数十年は保っている
 */
export const ABDICATION_MIN_INTERVAL = 14;

/** 禅譲で失う士族の支持と宗室の帰順。前の家の縁者が離れる */
export const ABDICATION_GENTRY_LOSS = 12;
export const ABDICATION_PRINCE_LOSS = 30;
/** 禅譲で州が動揺する */
export const ABDICATION_CONTROL_LOSS = 8;

// ── 君主と継承 ────────────────────────────────────────

export const RULER_MIN_ABILITY = 3;
export const RULER_MAX_ABILITY = 8;
/** 10%で能力7〜10の名君が出る */
export const EXCEPTIONAL_RULER_PROBABILITY = 0.1;
export const EXCEPTIONAL_MIN_ABILITY = 7;
/** 12%で軍事10の都督が出る */
export const EXCEPTIONAL_MARSHAL_PROBABILITY = 0.12;

export const RULER_MIN_LIFESPAN = 24;
export const RULER_MAX_LIFESPAN = 74;
/** 在位が極端に短い連続交代を避ける */
export const MIN_REIGN_YEARS = 3;
/** 成人と見なす年齢。これに満たない子は継げない */
export const ADULT_AGE = 15;

/** 暗殺の基礎確率。天命が低いほど上がる */
export const ASSASSINATION_BASE = 0.006;
export const ASSASSINATION_MANDATE_THRESHOLD = 50;
export const ASSASSINATION_PRESSURE_MAX = 7;

/** 継承の低下幅。血の近い順に3段 */
export const SUCCESSION_HEIR_MANDATE_LOSS = 3;
export const SUCCESSION_KIN_MANDATE_LOSS = 8;
export const SUCCESSION_CRISIS_MANDATE_LOSS = 18;
/** 混血の後継が即位したときの天命の負補正 */
export const MIXED_BLOOD_MANDATE_PENALTY = 6;

/**
 * 子が生まれる確率。毎年引く。
 *
 * **皇后を迎えていなくても引く。** 婚姻を結ばなければ子が一人も
 * 生まれない作りにしていたときは、開始時の一族三人を使い切ったあと
 * すべての代替わりが継承危機になり、1局に55回も王朝が替わった。
 * 帝に後宮があるのは当たり前で、婚姻外交はそこに乗る上積みにすぎない
 */
export const BIRTH_PROBABILITY = 0.13;
/** 皇后を迎えているあいだの上積み */
export const BIRTH_CONSORT_BONUS = 0.1;
/** 一族の人数の上限。これ以上は生まれない */
export const DYNASTY_MEMBER_MAX = 6;

// ── 婚姻 ──────────────────────────────────────────────

export const MARRIAGE_COST = 80;
/** 士族との縁組。成立率と効果 */
export const MARRIAGE_GENTRY_RATE = 0.85;
export const MARRIAGE_GENTRY_GAIN = 14;
export const MARRIAGE_GENTRY_MANDATE_GAIN = 5;
export const MARRIAGE_GENTRY_TAX_BASE_LOSS = 2;
/** 娘を出すのは朝廷を後ろ盾と見なす家だけ */
export const MARRIAGE_GENTRY_MIN_SUPPORT = 30;
/** 胡族との和親 */
export const MARRIAGE_TRIBE_RATE = 0.75;
export const MARRIAGE_TRIBE_LOYALTY_GAIN = 12;
export const MARRIAGE_TRIBE_GENTRY_LOSS = 8;
export const MARRIAGE_TRIBE_MANDATE_LOSS = 3;
/** 北朝との和親。成立が難しいこと自体が代償 */
export const MARRIAGE_NORTH_RATE = 0.35;
export const MARRIAGE_NORTH_MANDATE_GAIN = 8;
/** 子が生まれてから効く分 */
export const MARRIAGE_HEIR_GENTRY_GAIN = 8;
export const MARRIAGE_HEIR_TRIBAL_GAIN = 8;
/** 子が生まれるまでの年数 */
export const MARRIAGE_HEIR_DELAY = 3;

// ── 官職 ──────────────────────────────────────────────

export const OFFICIAL_MIN_TENURE = 4;
export const OFFICIAL_MAX_TENURE = 12;
export const CANDIDATE_COUNT = 3;
/** 任命にかかる金 */
export const APPOINT_COST = 40;
/** 解任で戻る天命と、離れる兵 */
export const DISMISS_MANDATE_GAIN = 3;
export const DISMISS_ARMY_LOSS = 0.07;

/** 刺史の反乱。正統性に関わらず毎年判定し、低いほど確率が上がる */
export const INSPECTOR_REVOLT_BASE = 0.0009;
export const INSPECTOR_REVOLT_AMBITION_PER_POINT = 0.34;

// ── 北朝 ──────────────────────────────────────────────

/**
 * 北朝が立てるようになる最も早い年。
 *
 * 前秦が華北をひとつにしたのが376年、北魏が439年。
 * 年の下限を置かなかったときは322年に北朝が立ち、
 * 八王の乱の直後にもう南北朝が始まっていた
 */
export const NORTH_FOUND_MIN_YEAR = 340;

/** 華北の州をこれだけ握った勢力は、散らばった侵入者ではなく朝廷になる */
export const NORTH_FOUND_PROVINCES = 3;
/** 北朝の初期戦力。取り込んだ勢力の戦力の合計に掛かる */
export const NORTH_FOUND_STRENGTH_SHARE = 0.55;
/** 北朝が年ごとに育つ率 */
export const NORTH_GROWTH_RATE = 0.016;
/** 北朝の戦力の天井。掛け算だけで伸ばすと際限がなくなる */
export const NORTH_MAX_STRENGTH = 300;
/** 一度潰しても最低限は立て直す。でないと南征そのものが起きない */
export const NORTH_REBUILD = 8;
/** 南征を始める確率 */
export const NORTH_OFFENSIVE_PROBABILITY = 0.16;
/** 南征が始まったあとの毎年の攻勢 */
export const NORTH_ATTACK_PROBABILITY = 0.4;
/** 君主の軍事能力1あたり、攻勢の頻度に乗る倍率 */
export const NORTH_TEMPO_PER_POINT = 0.045;
/** 北朝が分裂した年に失う戦力（534年の東西魏） */
export const NORTH_SPLIT_STRENGTH_LOSS = 0.42;

/** 北伐。取り返しに要る中軍の割合 */
export const EXPEDITION_NORTH_SHARE = 0.7;
/** 北伐で奪い返した州の初期支配度 */
export const EXPEDITION_RECOVERED_CONTROL = 34;

// ── 会戦 ──────────────────────────────────────────────

/** 会戦に投じる中軍の割合 */
export const BATTLE_ARMY_SHARE = 0.85;
/** 会戦を率いるのに要る君主の軍事能力 */
export const BATTLE_SOVEREIGN_MIN_MILITARY = 6;
/** 大敗したときに君主が捕虜になる確率 */
export const BATTLE_CAPTURE_PROBABILITY = 0.35;
/** 大敗と見なす戦力比 */
export const BATTLE_ROUT_RATIO = 0.55;
/** 会戦に勝ったときに得る天命 */
export const BATTLE_WIN_MANDATE = 8;
/** 会戦に負けたときに落ちる天命 */
export const BATTLE_LOSS_MANDATE = 10;
/** 動員できる州の数 */
export const MOBILIZE_MAX_PROVINCES = 2;
/** 動員で動く守備隊の割合 */
export const MOBILIZE_GARRISON_SHARE = 0.5;
/** 動員した兵は野戦軍ではないので働きが劣る */
export const MOBILIZE_EFFICIENCY = 0.7;
/** 表示のためだけの倍率。どの計算式にも掛からない */
export const MEN_PER_STRENGTH = 1000;

/** 戦場。戦列ごとの隊の上限 */
export const BATTLE_UNITS_PER_WING = 3;
/** 迂回が当たったときの倍率 */
export const FLANK_BONUS = 1.45;
/** 退却したときの被害の軽減 */
export const WITHDRAW_RELIEF = 0.45;
/** 戦場で積んだ優劣が会戦に乗る幅 */
export const TACTICS_MIN = 0.75;
export const TACTICS_MAX = 1.35;

// ── 存続の条件 ────────────────────────────────────────

/** 中軍がこれを割ると軍が壊滅したと見なす */
export const ARMY_COLLAPSE_THRESHOLD = 8;
/** 存続に要る最低限の天命 */
export const SURVIVAL_MIN_MANDATE = 15;
/** 存続に要る最低限の州の数 */
export const SURVIVAL_MIN_PROVINCES = 2;

// ── 都 ────────────────────────────────────────────────

/** 都の置ける州と、そこに立つ都城の名 */
export const CAPITAL_NAMES: Partial<Record<ProvinceId, string>> = {
  Si: '洛陽',
  Yong: '長安',
  Ji: '鄴',
  Yang: '建康',
  Jing: '江陵',
  Yi: '成都',
};

/** 南渡。北の都をすべて失ったとき、朝廷は江南へ移る */
export const CROSS_SOUTH_PROVINCE: ProvinceId = 'Yang';
export const CROSS_SOUTH_MANDATE_LOSS = 14;
export const CROSS_SOUTH_TAX_BASE_LOSS = 12;
/** 南渡してきた士族が朝廷を支える */
export const CROSS_SOUTH_GENTRY_GAIN = 10;

/** 都を敵に押さえられているあいだ、州は動揺し続ける */
export const CAPITAL_PRESSURE_CONTROL_LOSS = 3;
export const CAPITAL_FALL_MANDATE_LOSS = 16;

// ── 難易度 ────────────────────────────────────────────

/**
 * 難易度は新しいメカニクスを足さない。既存の計算式に掛かる倍率としてのみ働く。
 * **中級はすべて 1.0**。調整済みの基準バランスがそのまま中級になる
 */
export const DIFFICULTY_MODIFIERS: Record<Difficulty, DifficultyModifiers> = {
  beginner: {
    incomeMultiplier: 1.25,
    foePowerMultiplier: 0.82,
    auxiliaryEscalationMultiplier: 0.6,
    historicalSeverityMultiplier: 0.3,
  },
  standard: {
    incomeMultiplier: 1,
    foePowerMultiplier: 1,
    auxiliaryEscalationMultiplier: 1,
    historicalSeverityMultiplier: 0.6,
  },
  veteran: {
    incomeMultiplier: 0.9,
    foePowerMultiplier: 1.1,
    auxiliaryEscalationMultiplier: 1.35,
    historicalSeverityMultiplier: 1,
  },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: '初級',
  standard: '中級',
  veteran: '上級',
};

export function modifiersOf(difficulty: Difficulty): DifficultyModifiers {
  return DIFFICULTY_MODIFIERS[difficulty];
}
