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

  /** onceOnly なイベントの再発火防止用 */
  firedEventIds: string[];

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

export interface NegotiateMarriageAction {
  type: 'negotiate_marriage';
  factionId: BarbarianFactionId;
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

export type PlayerAction =
  | NegotiateTributeAction
  | NegotiateSettleAction
  | NegotiateMarriageAction
  | HireFoederatiAction
  | MilitaryDeployAction
  | MilitaryDefendAction
  | MilitaryConscriptAction
  | DomesticRaiseTaxesAction
  | DomesticReorganizeArmyAction
  | DomesticAppeaseSenateAction
  | EastRequestAidAction
  | EastConfirmTitleAction;

/** 1ターンに選べるアクションは最大2つ */
export type PlayerActions = [] | [PlayerAction] | [PlayerAction, PlayerAction];

// ── 乱数・コアループ ──────────────────────────────────

export type Seed = number;

export type TickFn = (state: GameState, actions: PlayerActions, seed: Seed) => GameState;

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
  stateConditions?: StateCondition[];
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
}

// ── 勝敗判定 ──────────────────────────────────────────

export interface ScoreResult {
  status: GameStatus;
  finalYear: number;
  provincesHeld: number;
  taxBase: number;
  legitimacy: number;
  score: number;
}
