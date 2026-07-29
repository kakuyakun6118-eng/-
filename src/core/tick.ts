import { applyBarbarianActions } from './barbarians';
import { ENDING_YEAR, FIELD_ARMY_COLLAPSE_THRESHOLD } from './constants';
import { calculateExpenses, calculateIncome } from './economy';
import { applyDesertion } from './military';
import { createRng } from './rng';
import type { GameState, GameStatus, PlayerActions, Seed } from './types';

/**
 * Phase 3: 収入・支出・蛮族AI・戦闘解決・勝敗判定を処理する。
 * プレイヤー行動の適用と歴史イベント発火は後続フェーズで追加する。
 */
export function tick(state: GameState, actions: PlayerActions, seed: Seed): GameState {
  const rng = createRng(seed);

  const income = calculateIncome(state);
  const expenses = calculateExpenses(state);

  let next: GameState = {
    ...state,
    turn: state.turn + 1,
    year: state.year + 1,
    treasury: state.treasury + income - expenses,
  };

  next = applyDesertion(next);
  next = applyBarbarianActions(next, rng);

  return { ...next, status: determineStatus(next) };
}

function determineStatus(state: GameState): GameStatus {
  if (state.status === 'collapsed') return 'collapsed';

  const italiaLost = state.provinces.Italia.control <= 0;
  const armyDestroyed = state.fieldArmy <= FIELD_ARMY_COLLAPSE_THRESHOLD;
  const bankrupt = state.treasury <= 0;

  if (italiaLost || (armyDestroyed && bankrupt)) {
    return 'collapsed';
  }

  if (state.year >= ENDING_YEAR) {
    const provincesHeld = Object.values(state.provinces).filter((p) => p.control > 0).length;
    return provincesHeld >= 2 ? 'survived' : 'collapsed';
  }

  return 'ongoing';
}
