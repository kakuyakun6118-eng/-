import type { GameState } from './types';
import { DESERTION_RATE } from './constants';

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
