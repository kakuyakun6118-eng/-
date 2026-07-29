import type { GameState, PlayerActions, Seed } from './types';
import { calculateExpenses, calculateIncome } from './economy';
import { applyDesertion } from './military';

/**
 * Phase 1: 収入と支出のみを処理する。
 * プレイヤー行動の適用・蛮族AI・戦闘解決・イベント発火は後続フェーズで追加する。
 */
export function tick(state: GameState, actions: PlayerActions, seed: Seed): GameState {
  const income = calculateIncome(state);
  const expenses = calculateExpenses(state);

  let next: GameState = {
    ...state,
    turn: state.turn + 1,
    year: state.year + 1,
    treasury: state.treasury + income - expenses,
  };

  next = applyDesertion(next);

  return next;
}
