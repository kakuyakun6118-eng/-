import type {
  BarbarianFaction,
  Dynasty,
  GameState,
  Province,
  ProvinceId,
} from './types';
import {
  APPEASE_SENATE_GAIN,
  APPEASE_SENATE_LEGITIMACY_GAIN,
  APPEASE_SENATE_TAX_BASE_LOSS,
  ARMY_UPKEEP_PER_UNIT,
  CONTROL_RECOVERY_PER_TURN,
  COURT_UPKEEP,
  INITIAL_EAST_RELATIONS,
  INITIAL_FIELD_ARMY,
  INITIAL_FOEDERATI_LOYALTY,
  INITIAL_LEGITIMACY,
  INITIAL_SENATE_SUPPORT,
  INITIAL_TAX_BASE,
  INITIAL_TREASURY,
  LEGITIMACY_NATURAL_DECAY,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MAX_TAX_BASE,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  MIN_TAX_BASE,
  RAISE_TAXES_CONTROL_LOSS,
  RAISE_TAXES_INCOME_MULTIPLIER,
  RAISE_TAXES_SENATE_LOSS,
  SENATE_INCOME_FLOOR,
  STARTING_YEAR,
  TAX_RATE,
} from './constants';
import { governanceModifier } from './dynasty';
import { clamp } from './util';

export function createInitialState(
  provinces: Province[],
  factions: BarbarianFaction[],
  dynasty: Dynasty,
): GameState {
  return {
    turn: 0,
    year: STARTING_YEAR,
    treasury: INITIAL_TREASURY,
    taxBase: INITIAL_TAX_BASE,
    fieldArmy: INITIAL_FIELD_ARMY,
    legitimacy: INITIAL_LEGITIMACY,
    senateSupport: INITIAL_SENATE_SUPPORT,
    eastRelations: INITIAL_EAST_RELATIONS,
    foederatiLoyalty: INITIAL_FOEDERATI_LOYALTY,
    provinces: Object.fromEntries(provinces.map((p) => [p.id, p])) as GameState['provinces'],
    factions: Object.fromEntries(factions.map((f) => [f.id, f])) as GameState['factions'],
    dynasty,
    firedEventIds: [],
    africaLost: false,
    status: 'ongoing',
  };
}

/**
 * 元老院の協力度が徴税効率に与える係数。
 * 支持を失うと属州から実際に吸い上げられる額が減る
 */
function senateIncomeFactor(senateSupport: number): number {
  const ratio = senateSupport / MAX_SENATE_SUPPORT;
  return SENATE_INCOME_FLOOR + (1 - SENATE_INCOME_FLOOR) * ratio;
}

export function calculateIncome(state: GameState): number {
  const provinceIncome = Object.values(state.provinces).reduce(
    (sum, province) => sum + (province.control / MAX_CONTROL) * province.baseTax,
    0,
  );
  return (
    provinceIncome *
    (state.taxBase / MAX_TAX_BASE) *
    TAX_RATE *
    senateIncomeFactor(state.senateSupport) *
    // 君主の統治能力は税収の補正として作用する
    governanceModifier(state)
  );
}

/**
 * 正統性の自然減。統治能力が高い君主ほど摩耗を抑えられる。
 * 能力が高いほど decay を小さくするため補正倍率で割る
 */
export function applyLegitimacyDecay(state: GameState): GameState {
  const decay = LEGITIMACY_NATURAL_DECAY / governanceModifier(state);
  return {
    ...state,
    legitimacy: clamp(state.legitimacy - decay, MIN_LEGITIMACY, MAX_LEGITIMACY),
  };
}

export function calculateExpenses(state: GameState): number {
  const armyUpkeep = state.fieldArmy * ARMY_UPKEEP_PER_UNIT;
  const tribute = Object.values(state.factions)
    .filter((faction) => faction.stance === 'foederati')
    .reduce((sum, faction) => sum + (faction.demand?.amount ?? 0), 0);
  return armyUpkeep + tribute + COURT_UPKEEP;
}

/** 徴税強化: 目先の収入を増やすが元老院の支持と属州の支配度を削る */
export function raiseTaxes(state: GameState): GameState {
  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    provinces[id] = {
      ...province,
      control: clamp(province.control - RAISE_TAXES_CONTROL_LOSS, MIN_CONTROL, MAX_CONTROL),
    };
  }
  return {
    ...state,
    treasury: state.treasury + calculateIncome(state) * RAISE_TAXES_INCOME_MULTIPLIER,
    senateSupport: clamp(
      state.senateSupport - RAISE_TAXES_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    provinces,
  };
}

/** 元老院への譲歩: 支持と正統性を買う代わりに免税特権で税基盤を恒久的に失う */
export function appeaseSenate(state: GameState): GameState {
  return {
    ...state,
    senateSupport: clamp(
      state.senateSupport + APPEASE_SENATE_GAIN,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    legitimacy: clamp(
      state.legitimacy + APPEASE_SENATE_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    taxBase: clamp(state.taxBase - APPEASE_SENATE_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE),
  };
}

/**
 * コアループ ステップ6: 支配度の更新。
 * 敵勢力（hostile / settled）がいない属州は徐々に支配を回復する
 */
export function updateControl(state: GameState): GameState {
  const occupied = new Set(
    Object.values(state.factions)
      .filter((faction) => faction.stance !== 'foederati' && faction.location !== 'exterior')
      .map((faction) => faction.location),
  );

  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    if (occupied.has(id)) continue;
    const province = provinces[id];
    if (province.control >= MAX_CONTROL) continue;
    provinces[id] = {
      ...province,
      control: clamp(province.control + CONTROL_RECOVERY_PER_TURN, MIN_CONTROL, MAX_CONTROL),
    };
  }
  return { ...state, provinces };
}
