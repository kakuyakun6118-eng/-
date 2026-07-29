import type { GameState, ProvinceId } from './types';
import {
  CONSCRIPT_ARMY_GAIN,
  CONSCRIPT_COST,
  CONSCRIPT_SENATE_LOSS,
  DEFEND_COST,
  DEFEND_GARRISON_GAIN,
  DEPLOY_ATTRITION_RATE,
  DESERTION_RATE,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  REORGANIZE_ARMY_GAIN,
  REORGANIZE_COST,
  USURPER_ARMY_LOSS_RATE,
  USURPER_LEGITIMACY_LOSS,
  USURPER_LEGITIMACY_THRESHOLD,
  USURPER_PROBABILITY,
} from './constants';
import { clamp } from './util';

/** 国庫が負なら野戦軍の一部が脱走する */
export function applyDesertion(state: GameState): GameState {
  if (state.treasury >= 0) return state;
  return { ...state, fieldArmy: state.fieldArmy * (1 - DESERTION_RATE) };
}

export interface CombatResult {
  attackerWins: boolean;
  /** 勝敗の差の絶対値。損耗量の算出に使う */
  margin: number;
}

export function resolveCombat(attackerPower: number, defenderPower: number): CombatResult {
  const margin = attackerPower - defenderPower;
  return { attackerWins: margin > 0, margin: Math.abs(margin) };
}

/** 徴募: 金を払って野戦軍を増やす。徴募の負担は元老院の支持を削る */
export function conscript(state: GameState): GameState {
  if (state.treasury < CONSCRIPT_COST) return state;
  return {
    ...state,
    treasury: state.treasury - CONSCRIPT_COST,
    fieldArmy: state.fieldArmy + CONSCRIPT_ARMY_GAIN,
    senateSupport: clamp(
      state.senateSupport - CONSCRIPT_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
  };
}

/** 軍の再編: 徴募より安く野戦軍を回復させる */
export function reorganizeArmy(state: GameState): GameState {
  if (state.treasury < REORGANIZE_COST) return state;
  return {
    ...state,
    treasury: state.treasury - REORGANIZE_COST,
    fieldArmy: state.fieldArmy + REORGANIZE_ARMY_GAIN,
  };
}

/** 属州防衛: 金を払って守備隊を増強する */
export function reinforceGarrison(state: GameState, provinceId: ProvinceId): GameState {
  if (state.treasury < DEFEND_COST) return state;
  const province = state.provinces[provinceId];
  return {
    ...state,
    treasury: state.treasury - DEFEND_COST,
    provinces: {
      ...state.provinces,
      [provinceId]: { ...province, garrison: province.garrison + DEFEND_GARRISON_GAIN },
    },
  };
}

/** 野戦軍の派遣: 移動と行軍で軍が損耗する。防衛への寄与は戦闘解決時に加算される */
export function applyDeployAttrition(state: GameState): GameState {
  return { ...state, fieldArmy: state.fieldArmy * (1 - DEPLOY_ATTRITION_RATE) };
}

/**
 * コアループ ステップ7: 正統性判定。
 * 正統性が閾値を下回ると簒奪者が現れ、野戦軍と正統性を失う
 */
export function checkUsurper(state: GameState, rng: () => number): GameState {
  if (state.legitimacy >= USURPER_LEGITIMACY_THRESHOLD) return state;
  if (rng() >= USURPER_PROBABILITY) return state;
  return {
    ...state,
    fieldArmy: state.fieldArmy * (1 - USURPER_ARMY_LOSS_RATE),
    legitimacy: clamp(
      state.legitimacy - USURPER_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}
