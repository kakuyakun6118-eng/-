import { applyBarbarianActions } from './barbarians';
import {
  ENDING_YEAR,
  FIELD_ARMY_COLLAPSE_THRESHOLD,
  SURVIVAL_MIN_LEGITIMACY,
} from './constants';
import {
  arrangeMarriage,
  confirmTitle,
  hireFoederati,
  payTribute,
  requestEastAid,
  settleFaction,
  settlePendingMarriages,
  updateFoederatiLoyalty,
  updateFoederatiObligations,
} from './diplomacy';
import { updateDynasty } from './dynasty';
import {
  appeaseSenate,
  applyLegitimacyDecay,
  applySenateDecay,
  calculateExpenses,
  calculateIncome,
  raiseTaxes,
  updateControl,
} from './economy';
import {
  applyDeployAttrition,
  applyDesertion,
  checkUsurper,
  conscript,
  reinforceGarrison,
  reorganizeArmy,
} from './military';
import { createRng } from './rng';
import type {
  GameState,
  GameStatus,
  PlayerAction,
  PlayerActions,
  ScoreResult,
  Seed,
  TurnModifiers,
} from './types';

/**
 * Phase 4B: 収入・支出・プレイヤー行動・蛮族AI・戦闘解決・
 * 支配度と税基盤の更新・正統性判定・王朝の更新までを処理する。
 * 歴史イベントの発火判定は Phase 6 で追加する。
 */
export function tick(state: GameState, actions: PlayerActions, seed: Seed): GameState {
  const rng = createRng(seed);

  // 1. 収入 / 2. 支出
  const income = calculateIncome(state);
  const expenses = calculateExpenses(state);

  let next: GameState = {
    ...state,
    turn: state.turn + 1,
    year: state.year + 1,
    treasury: state.treasury + income - expenses,
  };

  next = applyDesertion(next);
  next = updateFoederatiLoyalty(next);

  // 3. プレイヤー行動の適用
  const modifiers: TurnModifiers = { pacified: new Set(), reinforced: new Set() };
  for (const action of actions) {
    next = applyAction(next, action, modifiers, rng);
  }

  // 4. 蛮族AIの行動 / 5. 戦闘解決
  next = applyBarbarianActions(next, rng, modifiers);

  // 6. 支配度と税基盤の更新
  next = updateControl(next);
  next = updateFoederatiObligations(next);

  // 7. 正統性判定
  next = applyLegitimacyDecay(next);
  next = applySenateDecay(next);
  next = checkUsurper(next, rng);

  // 8. 王朝の更新（加齢・出生・寿命と暗殺の判定・継承）
  next = updateDynasty(next, rng);
  // 婚姻のうち、子が生まれて初めて発生する効果を清算する
  next = settlePendingMarriages(next);

  return { ...next, status: determineStatus(next) };
}

function applyAction(
  state: GameState,
  action: PlayerAction,
  modifiers: TurnModifiers,
  rng: () => number,
): GameState {
  switch (action.type) {
    case 'negotiate_tribute': {
      const paid = payTribute(state, action.factionId, action.amount);
      if (paid !== state) modifiers.pacified.add(action.factionId);
      return paid;
    }
    case 'negotiate_settle':
      return settleFaction(state, action.factionId, action.provinceId);
    case 'negotiate_marriage':
      return arrangeMarriage(state, action.target, rng);
    case 'hire_foederati':
      return hireFoederati(state, action.factionId);
    case 'military_deploy':
      modifiers.reinforced.add(action.provinceId);
      return applyDeployAttrition(state);
    case 'military_defend':
      return reinforceGarrison(state, action.provinceId);
    case 'military_conscript':
      return conscript(state);
    case 'domestic_raise_taxes':
      return raiseTaxes(state);
    case 'domestic_reorganize_army':
      return reorganizeArmy(state);
    case 'domestic_appease_senate':
      return appeaseSenate(state);
    case 'east_request_aid':
      return requestEastAid(state);
    case 'east_confirm_title':
      return confirmTitle(state);
  }
}

/** スコア = 保持属州数 × taxBase × legitimacy */
export function evaluateScore(state: GameState): ScoreResult {
  const provincesHeld = Object.values(state.provinces).filter((p) => p.control > 0).length;
  return {
    status: state.status,
    finalYear: state.year,
    provincesHeld,
    taxBase: state.taxBase,
    legitimacy: state.legitimacy,
    score: provincesHeld * state.taxBase * state.legitimacy,
    abilitiesAdjusted: state.dynasty.abilitiesAdjusted,
    difficulty: state.difficulty,
    rulerCount: state.dynasty.history.length + 1,
    successionCrises: state.dynasty.history.filter((d) => d.outcome === 'crisis').length,
  };
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
    /*
     * 正統性を失ったまま軍と属州だけが残っている状態は
     * 「名前だけの傀儡国家」であり、帝位が保たれたとは言えない。
     * 存続にはItaliaに加え1属州以上と、最低限の正統性の両方が要る
     */
    if (state.legitimacy < SURVIVAL_MIN_LEGITIMACY) return 'collapsed';
    return provincesHeld >= 2 ? 'survived' : 'collapsed';
  }

  return 'ongoing';
}
