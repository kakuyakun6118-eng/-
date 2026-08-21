/*
 * 291年（八王の乱の発端）から589年（隋の天下統一）までを
 * 中華の朝廷の実権者として運営するターン制シミュレーションの状態模型。
 *
 * 7つのパラメータが本体で、君主・官職・宗室・胡族・北朝は
 * すべて「既存の計算式への補正」として別サブ構造に置く。
 * **新しい資源を増やさない** ことをこの模型の規律とする。
 */

// ── 州 ────────────────────────────────────────────────

export type ProvinceId =
  | 'Si' // 司州 — 洛陽。天下の中心
  | 'Yong' // 雍州 — 長安と関中
  | 'Liang' // 涼州 — 河西回廊と西域
  | 'Bing' // 并州 — 汾水の谷。南匈奴の内徙した地
  | 'Ji' // 冀州 — 河北平原。鄴
  | 'You' // 幽州 — 薊と遼西
  | 'Qing' // 青州 — 山東
  | 'Yu' // 豫州 — 淮水の北。南北の争奪点
  | 'Yang' // 揚州 — 建康。江南の中枢
  | 'Jing' // 荊州 — 江漢。上流から都を睨む方鎮
  | 'Jiang' // 江州 — 鄱陽湖と閩
  | 'Yi' // 益州 — 蜀。四塞の地
  | 'Ning' // 寧州 — 南中
  | 'Guang' // 広州 — 嶺南
  | 'Jiao'; // 交州 — 日南。天下の南端

/** 淮水を境に南北を分ける。南渡したあとに保てるのは南だけ */
export type Region = 'north' | 'south';

/**
 * 州が朝廷の手を離れたとき、それを握っている者。
 * 朝廷が保っているあいだは null
 */
export type ProvinceHolder = FactionId | 'north' | 'prince';

export interface Province {
  id: ProvinceId;
  /** 支配度。0〜100。0 になるとその州は朝廷の手を離れる */
  control: number;
  /** 戸口の豊かさ。収入と募兵の元になる */
  baseTax: number;
  /**
   * 開発の上限。
   *
   * 江南はこの三百年で天下の穀倉に変わった。北から下ってきた戸が
   * 未墾の地を開き、荊揚の富が建康の朝廷を支えるようになる。
   * **これが無いと南渡した朝廷は軍を養えず、東晋も宋も成立しない**
   */
  baseTaxMax: number;
  /** 州兵。中軍とは別に、その州に貼り付いている */
  garrison: number;
  /**
   * 治所の城の耐久。
   *
   * 支配度が尽きても州はすぐには落ちない。**そこから城攻めが始まる。**
   * 洛陽・長安・建康のような大城は高く、辺境の城は低い。
   * 囲まれていない年は少しずつ修復される
   */
  wall: number;
  wallMax: number;
  region: Region;
  holder: ProvinceHolder | null;
}

// ── 胡族の勢力 ────────────────────────────────────────

export type FactionId =
  // すでに塞内へ移り住んでいる民（内徙）。郷里を持たない
  | 'Xiongnu' // 匈奴 — 并州。劉淵の漢趙
  | 'Jie' // 羯 — 冀州。石勒の後趙
  | 'Di' // 氐 — 雍州。苻氏の前秦
  | 'Qiang' // 羌 — 雍州。姚氏の後秦
  | 'Ba' // 巴氐 — 益州。李氏の成漢
  | 'Lushui' // 盧水胡 — 涼州。沮渠氏の北涼
  | 'Dingling' // 丁零 — 冀州。翟氏
  | 'Qifu' // 乞伏鮮卑 — 隴西
  // 塞外に郷里を持つ民
  | 'Tuoba' // 拓跋鮮卑 — 盛楽。のちの北魏
  | 'Murong' // 慕容鮮卑 — 遼東の北。前燕
  | 'Yuwen' // 宇文鮮卑 — 松嫩平原
  | 'Rouran' // 柔然 — 漠北の草原
  | 'Goguryeo' // 高句麗 — 丸都
  | 'Tuyuhun'; // 吐谷渾 — 青海

/**
 * 胡族と朝廷の関係。
 *
 * - `hostile` 敵対 — 州を侵し、支配度を削る
 * - `auxiliary` 帰順 — 義従胡として兵を出す。安いが給を絶やせば寝返る
 * - `enfeoffed` 建国 — 自立を認めた。敵ではなくなるが、その地の戸口は永久に失う
 */
export type FactionStance = 'hostile' | 'auxiliary' | 'enfeoffed';

/** 突きつけてくる要求 */
export type DemandType = 'gold' | 'land' | 'title';

export interface Demand {
  type: DemandType;
  amount: number;
  targetProvince?: ProvinceId;
}

/** 塞外にいる状態を 'exterior' として州と区別する */
export type FactionLocation = ProvinceId | 'exterior';

export interface Faction {
  id: FactionId;
  strength: number;
  /**
   * 戦力の天井。その民が史実で届いた高さに置く。
   *
   * これが無いと複利で伸び続け、320年代に前秦も北魏も超える怪物が
   * できあがった（300ターンの局では 6% の複利が11年で倍になる）。
   * 苻堅の前秦を 190、拓跋の北魏を 240 とし、
   * 掠めるだけの柔然は低く取る
   */
  strengthMax: number;
  stance: FactionStance;
  location: FactionLocation;
  /**
   * 攻め入れる州。
   *
   * これが無かったときは、遼東の慕容部が益州（蜀）を取る局が出た。
   * 弱く豊かな州を天下じゅうから選んでいたためで、
   * **どの民がどこへ出られるかは地理で決まる**
   */
  reach: ProvinceId[];
  demand: Demand | null;
  /**
   * 塞内へ移り住んでいる民か。
   *
   * この時代の胡族の多くはすでに州の中に暮らしていて、
   * 攻め戻る郷里を持たない。**敵はすでに垣の内にいる**
   */
  interior: boolean;
  /**
   * 掠めるだけで住み着かない民か（柔然）。
   * 奪った年のうちに塞外へ引き揚げ、塞外での成長にも上限がある
   */
  raider: boolean;
  /**
   * 野心 1〜10。**帝を称するのに要る州の数を決める。**
   *
   * 野心が高い民は一州を得ただけで帝号を称し、低い民も三州を得れば必ず称する。
   * 匈奴の劉淵も羯の石勒も、中原の一角を得た時点で皇帝を名乗った
   */
  ambition: number;
  /** 帝を称した年と、その帝の名。まだなら null */
  proclaimedYear: number | null;
  emperorName: string | null;
  /** 頂点を過ぎたら崩れ始める年。持たない勢力は null */
  collapseYear: number | null;
  /** 建国した年と国号。`enfeoffed` になったときに記録する */
  foundedYear: number | null;
  kingdomName: string | null;
}

/** 塞外の郷里。面を持つ勢力だけが持つ */
export type HomelandId = 'Tuoba' | 'Murong' | 'Yuwen' | 'Rouran' | 'Goguryeo' | 'Tuyuhun';

export interface Homeland {
  id: HomelandId;
  control: number;
  baseTax: number;
  garrison: number;
  /** 朝廷が奪えば 'court'。元の主が握っているなら 'tribe' */
  owner: 'tribe' | 'court';
}

// ── 宗室の諸王 ────────────────────────────────────────

/**
 * 八王の乱の当事者たち。
 *
 * 晋は魏の孤立を戒めて宗室に封国と兵を与えた。国境はそれで守れたが、
 * 与えた兵はそのまま帝位を狙う手勢になった。**この取引がこのゲームの
 * 第一の主題**なので、諸王は7パラメータではなく実在の人物として持つ
 */
export interface Prince {
  id: string;
  /** 汝南王亮・趙王倫 など */
  name: string;
  /** 鎮する州 */
  province: ProvinceId;
  /** 手勢。挙兵すればそのまま反乱軍になる */
  troops: number;
  /** 野心 1〜10。挙兵の確率にのみ効き、職務には効かない */
  ambition: number;
  /** 能力。皇帝と同じ三つ。即位したときはそのまま帝の能力になる */
  abilities: Abilities;
  /** 挙兵しているか */
  inRevolt: boolean;
  /** 世に出る年。それまでは登場しない */
  fromYear: number;
  /** 舞台を去る年。史実で没した年 */
  untilYear: number;
}

// ── 君主と王朝 ────────────────────────────────────────

/** 能力は3つのみ。増やさない。各1〜10 */
export interface Abilities {
  /** 軍事 — 戦闘解決（防御側戦力の補正） */
  military: number;
  /** 統治 — 税収、天命の自然減 */
  administration: number;
  /** 人望 — 士族の支持、諸王と胡族の帰順、交渉の成功率 */
  charisma: number;
}

export type Lineage = 'han' | 'mixed';

export interface Person {
  id: string;
  name: string;
  /** 年齢。加齢と継承の判定に使う */
  age: number;
  /**
   * 天寿。**その人物が生まれたときに一度だけ引く。**
   *
   * 毎年引き直していたときは、年ごとに新しい寿命を抽選して
   * 「いまの年齢がそれを超えていたら没する」と判じていたため、
   * 40歳の帝が毎年32%で死んだ。代替わりが三年に一度になり、
   * 生まれた子は15歳の成人に届かず、すべての継承が危機になって
   * 1局に40回も王朝が替わった
   */
  lifespan: number;
  abilities: Abilities;
  /** 皇帝との続柄 */
  relation: 'self' | 'child' | 'kin';
  lineage: Lineage;
}

export type DeathCause = 'natural' | 'assassination' | 'battle';
/**
 * 位がどう渡ったか。`usurped` は挙兵した藩王が都を陥として即いた場合で、
 * **王朝の号は替わらない**（趙王倫が晋の帝位に即いたのと同じ）ので
 * `crisis` とは分けて持つ
 */
export type SuccessionOutcome = 'heir' | 'kin' | 'crisis' | 'usurped';

export interface DeathRecord {
  name: string;
  /** 替わる前の王朝名。これが無いと家系図で代を辿れない */
  houseName: string;
  year: number;
  age: number;
  cause: DeathCause;
  outcome: SuccessionOutcome;
}

export interface Dynasty {
  /** 王朝の号。晋・宋・斉・梁・陳… 禅譲のたびに替わる */
  houseName: string;
  foundedYear: number;
  ruler: Person;
  /** 継承の候補。嫡子と傍系の一族 */
  members: Person[];
  history: DeathRecord[];
  /** 代替わりの名を引く候補。引いた名は取り除く */
  namePool: string[];
  /** 新しい王朝の号の候補 */
  housePool: string[];
  /**
   * 宗室に与える封国の号の候補。
   *
   * 生まれた王を「晋の元帝睿」のように王朝名＋帝号で呼んでいたときは、
   * その王が即位したあと**王朝が宋なのに帝の名が「晋の…」のまま**になった。
   * 王は在世中の呼び名（武陵王・江夏王…）で呼ぶ
   */
  princeTitlePool: string[];
  /** 設定から能力を変更したか。スコアの比較を無効にするための印 */
  abilitiesAdjusted: boolean;
  /** 皇后を迎えているか。婚姻外交の重複を防ぐ */
  consort: Consort | null;
  /** 子が生まれてはじめて効く婚姻の効果 */
  pendingMarriages: PendingMarriage[];
}

export type MarriageKind = 'gentry' | 'tribe' | 'north';

export interface Consort {
  name: string;
  kind: MarriageKind;
  /** 胡族と結んだ場合の相手 */
  factionId: FactionId | null;
  /** 士族と結んだ場合の家門 */
  houseId: string | null;
  marriedYear: number;
}

export interface PendingMarriage {
  kind: MarriageKind;
  factionId: FactionId | null;
  /** 子が生まれる年。その年に効果を清算する */
  dueYear: number;
}

// ── 官職 ──────────────────────────────────────────────

/**
 * 能力と野心を別の軸にする。任命は候補から選ぶので、
 * 「能力7・野心8 を採るか、能力5・野心5 にしておくか」が判断になる。
 * 野心は反乱の確率にのみ効き、職務には一切効かない
 */
export interface Official {
  id: string;
  name: string;
  /** 職務の能力 1〜10 */
  competence: number;
  /** 野心 1〜10 */
  ambition: number;
  /** 任期の残り年数 */
  tenure: number;
  /** 出身。士族なら士族の支持に効く */
  gentryBorn: boolean;
}

/** 都督中外諸軍事。この時代に実際に軍を握っていた席 */
export interface MarshalSeat {
  holder: Official | null;
  /** 史実の人物として迎えたか。年で引いた者は二度は出ない */
  hiredHistorical: string[];
}

// ── 北朝 ──────────────────────────────────────────────

/**
 * 胡族の一つが華北をまとめ上げると、散らばった侵入者ではなく
 * **もう一つの朝廷**になる。前秦・北魏・北周がこれにあたる。
 *
 * 7パラメータには含めない。既存の侵攻・戦闘解決の相手として働くだけ
 */
export interface NorthernCourt {
  founderId: FactionId;
  /** 国号。前秦・北魏・東魏… 年と founder から引く */
  name: string;
  rulerName: string;
  /** 君主の軍事能力。戦闘解決の攻撃側戦力に掛かる */
  rulerMilitary: number;
  strength: number;
  foundedYear: number;
  /** 南征を始めた年。まだなら null */
  offensiveSince: number | null;
  /** 一度分裂したか。史実の534年（東西魏）を表す */
  splitYear: number | null;
}

// ── 会戦 ──────────────────────────────────────────────

export type BattleFoe =
  | { kind: 'faction'; factionId: FactionId }
  | { kind: 'north' }
  | { kind: 'prince'; princeId: string };

export type BattleLeader = 'sovereign' | 'marshal';

export type WingId = 'left' | 'center' | 'right';
export type ArmKind = 'foot' | 'horse' | 'bow';
export type WingOrder = 'advance' | 'flank' | 'withdraw';

export interface BattleUnit {
  id: string;
  arm: ArmKind;
  strength: number;
  morale: number;
  side: 'court' | 'foe';
  wing: WingId | null;
}

export interface Battlefield {
  foe: BattleFoe;
  leader: BattleLeader;
  leaderName: string;
  leaderMilitary: number;
  /** 地形。戦場の絵と補正に効く */
  terrain: 'plain' | 'river' | 'hill' | 'forest' | 'desert';
  units: BattleUnit[];
  round: number;
  phase: 'deploy' | 'orders' | 'done';
  /** 動員した州。その年のあいだ守りが薄くなる */
  mobilized: ProvinceId[];
  log: string[];
  pendingActions: PlayerAction[];
}

export interface BattleDeployment {
  /** 隊 id → 戦列。null に戻すと控えへ */
  placements: Record<string, WingId | null>;
}

export type BattleOrders = Record<WingId, WingOrder>;

// ── 難易度とシナリオ ──────────────────────────────────

export type Difficulty = 'beginner' | 'standard' | 'veteran';

export interface DifficultyModifiers {
  /** 税収。循環の罠に効く */
  incomeMultiplier: number;
  /** 戦闘解決の攻撃側戦力。循環の罠に効く */
  foePowerMultiplier: number;
  /** 義従胡の給の膨張率。短期と長期の取引に効く */
  auxiliaryEscalationMultiplier: number;
  /** 有害な歴史イベントの発火確率と被害量。史実展開の再現度 */
  historicalSeverityMultiplier: number;
}

// ── 状態模型（7パラメータ固定） ───────────────────────

export interface GameState {
  turn: number;
  /** 291〜589 */
  year: number;

  /** 国庫（銭・帛） */
  treasury: number;
  /** 戸口。州の支配度に比例。流民と胡族の建国で恒久的に減る */
  taxBase: number;
  /** 中軍（禁軍）。朝廷が直接握る兵。維持費が最大の支出 */
  centralArmy: number;
  /** 天命。勝利と譲歩で上がり、敗戦・簒奪・州の喪失で下がる */
  mandate: number;
  /** 士族の支持。門閥貴族。増税で下がり、特権の追認で上がる */
  gentry: number;
  /** 宗室諸王の帰順。削藩で下がり、鎮撫で上がる */
  princeLoyalty: number;
  /** 胡族の帰順。給の支払い実績に連動。絶えると寝返る */
  tribalLoyalty: number;

  provinces: Record<ProvinceId, Province>;
  factions: Record<FactionId, Faction>;
  homelands: Record<HomelandId, Homeland>;
  princes: Prince[];
  dynasty: Dynasty;
  marshal: MarshalSeat;
  /** 録尚書事。税務と人事を統べる文官の筆頭 */
  chancellor: Official | null;
  /** 州の刺史。その州の守備と支配度の回復に効く */
  inspectors: Partial<Record<ProvinceId, Official>>;
  /** 任命の候補。毎年入れ替わる */
  candidates: Official[];
  north: NorthernCourt | null;
  battlefield: Battlefield | null;

  /** 都。洛陽 → 長安 → 建康 と移る */
  capital: ProvinceId;
  capitalName: string;
  /** 南渡した年。まだなら null */
  crossedSouthYear: number | null;
  /**
   * はじめて州を失った年。まだなら null。
   *
   * 291年の朝廷はすでに天下を保っているので、**統一は開始条件そのもの**。
   * 一度も割れていない局を「統一を果たした」と数えると、
   * 1ターン目に勝ちになってしまう。割れたことがあってはじめて、
   * 取り戻したことが統一として意味を持つ
   */
  fragmentedYear: number | null;
  /** 天下を統一した年。まだなら null */
  unifiedYear: number | null;

  difficulty: Difficulty;
  /**
   * 舞台を去った諸王の id。
   *
   * これが無かったときは、誅殺した王が翌年また封国を得て現れた
   * （史実の在世年のあいだじゅう何度でも復活した）
   */
  retiredPrinceIds: string[];
  /** onceOnly なイベントの再発火防止用 */
  firedEventIds: string[];
  /** その年に起きた出来事。表示のためだけに毎ターン作り直す */
  turnEvents: TurnEventId[];

  status: GameStatus;
}

export type GameStatus = 'ongoing' | 'survived' | 'unified' | 'fallen';

/** 状態の差分からは読み取れない出来事。core が記録し ui が日本語にする */
export type TurnEventId =
  | 'crossed_south'
  | 'capital_fell'
  | 'capital_moved'
  | 'north_founded'
  | 'north_split'
  | 'north_offensive'
  | 'prince_revolt'
  | 'prince_suppressed'
  | 'prince_took_capital'
  | 'faction_proclaimed'
  | 'city_fell'
  | 'usurpation'
  | 'abdication'
  | 'succession_crisis'
  | 'auxiliary_defected'
  | 'army_deserted'
  | 'battle_won'
  | 'battle_lost'
  | 'sovereign_captured'
  | 'unified'
  | 'sui_unified';

// ── プレイヤーのアクション ────────────────────────────

export type ActionCategory = 'court' | 'tribe' | 'military' | 'domestic' | 'north';

export interface TributeAction {
  type: 'tribe_tribute';
  factionId: FactionId;
  amount: number;
}
export interface EnfeoffAction {
  type: 'tribe_enfeoff';
  factionId: FactionId;
  provinceId: ProvinceId;
}
export interface HireAuxiliaryAction {
  type: 'tribe_hire';
  factionId: FactionId;
}
export interface AcceptDemandAction {
  type: 'tribe_accept_demand';
  factionId: FactionId;
}
export interface SubdueHomelandAction {
  type: 'tribe_subdue_homeland';
  homelandId: HomelandId;
}
export interface MarriageAction {
  type: 'court_marriage';
  target:
    | { kind: 'gentry'; houseId: string }
    | { kind: 'tribe'; factionId: FactionId }
    | { kind: 'north' };
}

export interface AppointChancellorAction {
  type: 'court_appoint_chancellor';
  officialId: string;
}
export interface DismissChancellorAction {
  type: 'court_dismiss_chancellor';
}
export interface AppointInspectorAction {
  type: 'court_appoint_inspector';
  provinceId: ProvinceId;
  officialId: string;
}
export interface DismissInspectorAction {
  type: 'court_dismiss_inspector';
  provinceId: ProvinceId;
}
export interface AppointMarshalAction {
  type: 'military_appoint_marshal';
}
export interface DismissMarshalAction {
  type: 'military_dismiss_marshal';
}

export interface PacifyPrincesAction {
  type: 'court_pacify_princes';
}
export interface CurtailPrincesAction {
  type: 'court_curtail_princes';
}
export interface ExecutePrinceAction {
  type: 'court_execute_prince';
  princeId: string;
}
export interface EnfeoffPrinceAction {
  type: 'court_empower_prince';
  princeId: string;
}

export interface DeployAction {
  type: 'military_deploy';
  provinceId: ProvinceId;
}
export interface DefendAction {
  type: 'military_defend';
  provinceId: ProvinceId;
}
export interface ConscriptAction {
  type: 'military_conscript';
}
export interface RecruitProvinceAction {
  type: 'military_recruit_province';
  provinceId: ProvinceId;
}
export interface PitchedBattleAction {
  type: 'military_pitched_battle';
  foe: BattleFoe;
  leader: BattleLeader;
  mobilize?: ProvinceId[];
  /** 戦場で積んだ優劣。経ていなければ 1.0 */
  tactics?: number;
}
export interface SuppressPrinceAction {
  type: 'military_suppress_prince';
  princeId: string;
}
/** 北伐。失われた州を取り返す */
export interface NorthernExpeditionAction {
  type: 'military_northern_expedition';
  provinceId: ProvinceId;
}

export interface RaiseTaxesAction {
  type: 'domestic_raise_taxes';
}
export interface ReorganizeArmyAction {
  type: 'domestic_reorganize_army';
}
export interface ConfirmPrivilegeAction {
  type: 'domestic_confirm_privilege';
}
export interface PureConversationAction {
  type: 'domestic_hold_conversation';
}
export interface GrantRankAction {
  type: 'domestic_grant_rank';
}
export interface SettleRefugeesAction {
  type: 'domestic_settle_refugees';
}
/** 土断。僑州の戸を土地に結び直し、戸口を戻す */
export interface RegisterHouseholdsAction {
  type: 'domestic_register_households';
}
/** 遷都。都を移す */
export interface MoveCapitalAction {
  type: 'domestic_move_capital';
  provinceId: ProvinceId;
}

export type PlayerAction =
  | TributeAction
  | EnfeoffAction
  | HireAuxiliaryAction
  | AcceptDemandAction
  | SubdueHomelandAction
  | MarriageAction
  | AppointChancellorAction
  | DismissChancellorAction
  | AppointInspectorAction
  | DismissInspectorAction
  | AppointMarshalAction
  | DismissMarshalAction
  | PacifyPrincesAction
  | CurtailPrincesAction
  | ExecutePrinceAction
  | EnfeoffPrinceAction
  | DeployAction
  | DefendAction
  | ConscriptAction
  | RecruitProvinceAction
  | PitchedBattleAction
  | SuppressPrinceAction
  | NorthernExpeditionAction
  | RaiseTaxesAction
  | ReorganizeArmyAction
  | ConfirmPrivilegeAction
  | PureConversationAction
  | GrantRankAction
  | SettleRefugeesAction
  | RegisterHouseholdsAction
  | MoveCapitalAction;

/** 1ターンに選べる行動は最大2つ */
export type PlayerActions = PlayerAction[];

/** その年のあいだだけ効く印。tick() の中で持ち回る */
export interface TurnModifiers {
  /** 要求を飲んで宥めた勢力。その年は攻めてこない */
  pacified: Set<FactionId>;
  /** 中軍を差し向けた州 */
  reinforced: Set<ProvinceId>;
  /**
   * その年に城を攻めた者。州が落ちたとき誰の手に渡るかをここから引く。
   *
   * これが無かったときは、攻めた者のいない州が支配度を失っただけで
   * 北朝のものになった（嶺南の交州が北朝領になる局が出た）
   */
  besieged: Map<ProvinceId, ProvinceHolder>;
}

// ── 乱数とコアループ ──────────────────────────────────

export type Seed = number;
export type TickFn = (state: GameState, actions: PlayerActions, seed: Seed) => GameState;

// ── 歴史イベント（data/events.json の型） ────────────

export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';

export interface StateCondition {
  /** GameState 内へのパス。例: "treasury" / "provinces.Si.control" */
  field: string;
  operator: ComparisonOperator;
  value: number | string | boolean;
}

export interface EventCondition {
  year?: number;
  minYear?: number;
  maxYear?: number;
  stateConditions?: StateCondition[];
}

export interface EventEffect {
  field: string;
  delta?: number;
  set?: number | string | boolean;
}

export interface HistoricalEvent {
  id: string;
  /** 史実上の年（発火条件とは独立した参考情報） */
  year: number;
  title: string;
  description: string;
  condition: EventCondition;
  effects: EventEffect[];
  onceOnly: boolean;
  /** 有害なイベントか。難易度による緩和はこれにだけ掛ける */
  harmful: boolean;
  /** 発火確率。省略時は 1.0 */
  probability?: number;
}

// ── 勝敗判定 ──────────────────────────────────────────

export interface ScoreResult {
  status: GameStatus;
  finalYear: number;
  provincesHeld: number;
  taxBase: number;
  mandate: number;
  score: number;
  difficulty: Difficulty;
  houseName: string;
  /** 何代の君主を経たか */
  rulerCount: number;
  /** 何度王朝が替わったか */
  houseChanges: number;
  abilitiesAdjusted: boolean;
  unifiedYear: number | null;
  crossedSouthYear: number | null;
}
