// Phase 0: 型定義のみ。ロジックは含まない。

// ── 属州 ──────────────────────────────────────────────

export type ProvinceId =
  | 'Gallia'
  | 'Hispania'
  | 'Britannia'
  | 'Africa'
  | 'Italia'
  | 'Illyricum'
  | 'Noricum';

export interface Province {
  id: ProvinceId;
  /** 支配度。0〜100 */
  control: number;
  baseTax: number;
  garrison: number;
}

// ── 蛮族勢力 ──────────────────────────────────────────

export type BarbarianFactionId =
  | 'Visigoths'
  | 'Vandals'
  | 'Huns'
  | 'Franks'
  | 'Burgundians'
  | 'Suebi'
  | 'Alans'
  | 'Saxons';

export type BarbarianStance = 'hostile' | 'foederati' | 'settled';

export type BarbarianDemandType = 'gold' | 'land' | 'title';

export interface BarbarianDemand {
  type: BarbarianDemandType;
  amount: number;
  targetProvince?: ProvinceId;
}

/** 属州の外（帝国境外）にいる状態を 'exterior' として区別する */
export type BarbarianLocation = ProvinceId | 'exterior';

export interface BarbarianFaction {
  id: BarbarianFactionId;
  strength: number;
  stance: BarbarianStance;
  location: BarbarianLocation;
  demand: BarbarianDemand | null;
  /** 帝国境外から侵入する際にたどる属州の経路（史実の進路を模す） */
  route: ProvinceId[];
  /** route 上で次に狙う位置のインデックス */
  routeIndex: number;
}

// ── 君主と王朝 ────────────────────────────────────────

/**
 * 君主の能力。3つのみ。増やさない。各1〜10。
 * これは資源ではなく、既存の計算式に対する補正倍率の元になる値
 */
export interface RulerAbilities {
  /** 軍事 — 戦闘解決の防御側戦力を補正する */
  military: number;
  /** 統治 — 税収と legitimacy の自然減を補正する */
  governance: number;
  /** 交渉 — 貢納コストと交渉成功率を補正する */
  diplomacy: number;
}

/** 婚姻相手の出自 */
export type MarriageOrigin =
  | { kind: 'barbarian'; factionId: BarbarianFactionId }
  | { kind: 'east' };

/** 王朝の血統。ローマ系か、混血の場合はどの勢力の血が入っているか */
export type Lineage = 'roman' | 'east' | BarbarianFactionId;

export interface Spouse {
  id: string;
  origin: MarriageOrigin;
  marriedYear: number;
}

/** 継承候補となる王朝の一員 */
export interface DynastyMember {
  id: string;
  birthYear: number;
  abilities: RulerAbilities;
  /** 出身家系 */
  lineage: Lineage;
  /** 嫡子か（庶子・傍系は継承時の正統性低下が大きい） */
  legitimate: boolean;
  /** 混血の後継者は legitimacy に負の補正がつく */
  mixedBlood: boolean;
  /** 混血によって得た、その勢力に対する請求権 */
  claims: BarbarianFactionId[];
}

export interface Ruler extends DynastyMember {
  accessionYear: number;
  /** 天命で定めた没年。暗殺されるとこの年より早く死ぬ */
  fatedDeathYear: number;
  deathYear: number | null;
  spouse: Spouse | null;
  /** 子の DynastyMember.id */
  childIds: string[];
}

export type SuccessionOutcome = 'heir' | 'crisis';

export interface DeathRecord {
  rulerId: string;
  year: number;
  cause: 'natural' | 'assassination';
  outcome: SuccessionOutcome;
}

export interface Dynasty {
  name: string;
  ruler: Ruler;
  /** 継承候補（君主の子や傍系） */
  members: DynastyMember[];
  /** 成立済みの婚姻のうち、子の誕生を待っている効果 */
  pendingMarriages: PendingMarriage[];
  /** 歴代の死と継承の記録 */
  history: DeathRecord[];
  /** 継承危機の余韻。0より大きい間は簒奪者の確率が上がる */
  crisisYearsRemaining: number;
  /**
   * 君主能力を設定から変更したセーブに立つフラグ。
   * スコア比較を無意味にしないため必ず記録に残す
   */
  abilitiesAdjusted: boolean;
}

// ── マギステル・ミリトゥム（軍司令官） ────────────────

/**
 * 軍司令官。
 *
 * 395〜476年の西ローマを実際に動かしていたのは皇帝ではなくこの職で、
 * スティリコ・アエティウス・リキメルはいずれも皇帝ではない。
 *
 * 7パラメータには含めず、王朝と同じく GameState の別サブ構造として持つ。
 * 新しい資源ではなく、既存の計算式（戦闘の防御側戦力・legitimacy の
 * 自然減・簒奪者の確率）に対する補正としてのみ作用する
 */
export interface General {
  id: string;
  /** 軍事。君主の軍事能力と同じ尺度 */
  military: number;
  appointedYear: number;
  /** 天命で定めた退任年。これを過ぎると職を退く */
  retiresYear: number;
}

export type GeneralEnd = 'dismissed' | 'retired' | 'usurped';

export interface GeneralRecord {
  generalId: string;
  military: number;
  fromYear: number;
  toYear: number;
  end: GeneralEnd;
}

/** 軍司令官の職。空位でも遊べるが、その間は防衛が弱くなる */
export interface GeneralSeat {
  current: General | null;
  /** 歴代の記録。年代記に出す */
  history: GeneralRecord[];
}

/** 子が生まれてから発生する婚姻の効果 */
export interface PendingMarriage {
  origin: MarriageOrigin;
  marriedYear: number;
}

// ── 難易度 ────────────────────────────────────────────

export type Difficulty = 'beginner' | 'standard' | 'veteran';

/**
 * 難易度は新しいメカニクスを足さず、既存の計算式に掛ける倍率
 * としてのみ作用する。中級(standard)はすべて 1.0 で、
 * 調整済みの基準バランスがそのまま中級になる
 */
export interface DifficultySettings {
  /** 税収にかかる倍率 */
  incomeMultiplier: number;
  /** 蛮族の攻撃側戦力にかかる倍率 */
  barbarianPowerMultiplier: number;
  /** フォエデラティの給金要求の膨張率にかかる倍率 */
  foederatiEscalationMultiplier: number;
  /**
   * 史実の災厄がどれだけ再現されるか。
   * 有害な歴史イベントの発火確率と被害量の両方に掛かる。
   * 1.0 で史実通り、小さいほど西ローマに有利な歴史になる
   */
  historicalSeverityMultiplier: number;
}

/**
 * その年に起きたが、前後の状態を見比べても復元できない出来事。
 *
 * 脱走も簒奪未遂も野戦軍を減らすだけなので、記録しないと
 * プレイヤーには「理由の説明なく軍が消えた」としか見えない。
 * 表示する文言は ui 側で当てる。core に画面用の文字列は置かない
 */
export type TurnEventId =
  | 'desertion'
  | 'usurper_attempt'
  /** 簒奪を起こしたのが軍司令官だった年 */
  | 'general_usurped'
  /** 軍司令官が任期を終えて職を退いた年 */
  | 'general_retired';

// ── 状態モデル（7パラメータ固定） ────────────────────

export interface GameState {
  turn: number;
  /** 395〜476 */
  year: number;

  treasury: number;
  taxBase: number;
  fieldArmy: number;
  legitimacy: number;
  senateSupport: number;
  eastRelations: number;
  foederatiLoyalty: number;

  provinces: Record<ProvinceId, Province>;
  factions: Record<BarbarianFactionId, BarbarianFaction>;

  /** 君主と王朝。7パラメータには含めない別サブ構造 */
  dynasty: Dynasty;

  /** 軍司令官。これも7パラメータには含めない別サブ構造 */
  general: GeneralSeat;

  /** 難易度。7パラメータではなくプレイ開始時の設定 */
  difficulty: Difficulty;

  /** onceOnly なイベントの再発火防止用 */
  firedEventIds: string[];

  /** その年に起きた、状態の差分からは読み取れない出来事。毎ターン作り直す */
  turnEvents: TurnEventId[];

  /** Africa の control が一度でも0以下になったか（Italia への恒久ペナルティは一度だけ適用） */
  africaLost: boolean;

  status: GameStatus;
}

export type GameStatus = 'ongoing' | 'survived' | 'collapsed';

// ── プレイヤーアクション（1ターン最大2つ） ──────────

export type ActionCategory = 'diplomacy' | 'hire' | 'military' | 'domestic' | 'east';

export interface NegotiateTributeAction {
  type: 'negotiate_tribute';
  factionId: BarbarianFactionId;
  amount: number;
}

export interface NegotiateSettleAction {
  type: 'negotiate_settle';
  factionId: BarbarianFactionId;
  provinceId: ProvinceId;
}

/**
 * 突きつけられた要求を飲む。
 * 何を差し出すかは要求の種類が決めるので、プレイヤーは相手を選ぶだけ
 */
export interface NegotiateAcceptDemandAction {
  type: 'negotiate_accept_demand';
  factionId: BarbarianFactionId;
}

/**
 * 婚姻同盟。相手は蛮族勢力の族長家または東ローマ帝室。
 * Task B の診断（枠を増やすと生存率が下がる＝枠は不足していない）に
 * 基づき、無償にせず行動枠を消費させる
 */
export interface NegotiateMarriageAction {
  type: 'negotiate_marriage';
  target: MarriageOrigin;
}

export interface HireFoederatiAction {
  type: 'hire_foederati';
  factionId: BarbarianFactionId;
}

export interface MilitaryDeployAction {
  type: 'military_deploy';
  provinceId: ProvinceId;
}

export interface MilitaryDefendAction {
  type: 'military_defend';
  provinceId: ProvinceId;
}

export interface MilitaryConscriptAction {
  type: 'military_conscript';
}

export interface DomesticRaiseTaxesAction {
  type: 'domestic_raise_taxes';
}

export interface DomesticReorganizeArmyAction {
  type: 'domestic_reorganize_army';
}

export interface DomesticAppeaseSenateAction {
  type: 'domestic_appease_senate';
}

export interface EastRequestAidAction {
  type: 'east_request_aid';
}

export interface EastConfirmTitleAction {
  type: 'east_confirm_title';
}

/** 軍司令官を任命する。空位を埋める */
export interface MilitaryAppointGeneralAction {
  type: 'military_appoint_general';
}

/**
 * 軍司令官を解任する。
 * 正統性は戻るが、その将に従っていた兵は離れる
 */
export interface MilitaryDismissGeneralAction {
  type: 'military_dismiss_general';
}

export type PlayerAction =
  | NegotiateTributeAction
  | NegotiateSettleAction
  | NegotiateAcceptDemandAction
  | NegotiateMarriageAction
  | HireFoederatiAction
  | MilitaryDeployAction
  | MilitaryDefendAction
  | MilitaryConscriptAction
  | MilitaryAppointGeneralAction
  | MilitaryDismissGeneralAction
  | DomesticRaiseTaxesAction
  | DomesticReorganizeArmyAction
  | DomesticAppeaseSenateAction
  | EastRequestAidAction
  | EastConfirmTitleAction;

/**
 * 1ターンに渡すアクション。
 *
 * 行動枠を消費するものは MAX_ACTIONS_PER_TURN までで、超えた分は
 * tick が捨てる。突きつけられた要求への応答だけは枠を消費しない
 * （consumesActionSlot を参照）ので、要素数は固定にできない
 */
export type PlayerActions = readonly PlayerAction[];

// ── 乱数・コアループ ──────────────────────────────────

export type Seed = number;

export type TickFn = (state: GameState, actions: PlayerActions, seed: Seed) => GameState;

/**
 * プレイヤー行動がそのターンの蛮族AI・戦闘解決にだけ与える影響。
 * ターンをまたいで持ち越さないため GameState には保持しない
 */
export interface TurnModifiers {
  /** 貢納で買収済みの勢力。このターンは攻撃してこない */
  pacified: Set<BarbarianFactionId>;
  /** 野戦軍を派遣した属州。防衛時の野戦軍寄与が上がる */
  reinforced: Set<ProvinceId>;
}

// ── 歴史イベント（data/events.json の型） ────────────

export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';

export interface StateCondition {
  /** GameState 内へのパス。例: "treasury" / "provinces.Africa.control" */
  field: string;
  operator: ComparisonOperator;
  value: number | string | boolean;
}

export interface EventCondition {
  year?: number;
  minYear?: number;
  maxYear?: number;
  /** すべて満たす必要がある条件（AND） */
  stateConditions?: StateCondition[];
  /**
   * いずれか1つ満たせばよい条件（OR）。
   * 「ヒスパニアまたはガリアにいる」のように発火口を複数持たせるために使う。
   * stateConditions と併用した場合は AND で結ばれる
   */
  anyOf?: StateCondition[];
}

export interface EventEffect {
  /** GameState 内へのパス。例: "treasury" / "provinces.Africa.control" */
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
  /**
   * 帝国にとって不利なイベントか。
   * 難易度による緩和は有害なイベントにだけ掛ける。
   * 有益なイベント（カタラウヌムの勝利など）まで弱めると
   * 初級のほうが不利になってしまうため
   */
  harmful: boolean;
}

// ── 勝敗判定 ──────────────────────────────────────────

export interface ScoreResult {
  status: GameStatus;
  finalYear: number;
  provincesHeld: number;
  taxBase: number;
  legitimacy: number;
  score: number;
  /** 君主能力を設定から変更したプレイ。他のスコアと比較できない */
  abilitiesAdjusted: boolean;
  /** 難易度。異なる難易度のスコアは比較できない */
  difficulty: Difficulty;
  /** 歴代君主の数 */
  rulerCount: number;
  /** 継承危機の回数 */
  successionCrises: number;
}
