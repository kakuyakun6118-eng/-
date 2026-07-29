import type { GameState } from './types';
import { DESERTION_RATE } from './constants';

/** 国庫が負なら野戦軍の一部が脱走する */
export function applyDesertion(state: GameState): GameState {
  if (state.treasury >= 0) return state;
  return { ...state, fieldArmy: state.fieldArmy * (1 - DESERTION_RATE) };
}
