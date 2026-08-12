import {
  availableBattleLeaders,
  canGiveBattle,
  giveBattle,
} from './battle';
import {
  autoResolveBattlefield,
  battleRound,
  battlefieldTactics,
  deployBattlefield,
  openBattlefield,
} from './battlefield';
import type { BattleDeployment, BattleOrders } from './types';
import { applyCapitalFall, applyCapitalPressure, checkSouthwardCrossing } from './capital';
import {
  ARMY_COLLAPSE_THRESHOLD,
  ENDING_YEAR,
  MAX_ACTIONS_PER_TURN,
  SURVIVAL_MIN_MANDATE,
  SURVIVAL_MIN_PROVINCES,
} from './constants';
import {
  acceptDemand,
  arrangeMarriage,
  checkAuxiliaryDefection,
  enfeoffFaction,
  hireAuxiliary,
  payTribute,
  settleAuxiliaryPay,
  settlePendingMarriages,
  subdueHomeland,
  updateHomelands,
} from './diplomacy';
import { abdicate, updateDynasty } from './dynasty';
import {
  applyDecay,
  calculateExpenses,
  calculateIncome,
  confirmPrivilege,
  developProvinces,
  grantRank,
  repairWalls,
  holdConversation,
  moveCapital,
  raiseTaxes,
  recoverHouseholds,
  registerHouseholds,
  settleRefugees,
  updateControl,
} from './economy';
import { applyHistoricalEvents } from './events';
import {
  applyFactionActions,
  applyProvinceLosses,
  checkProclamations,
  updateDemands,
} from './factions';
import {
  applyDeployAttrition,
  applyDesertion,
  checkUsurpation,
  conscript,
  recoverProvince,
  recruitInProvince,
  reinforceGarrison,
  reorganizeArmy,
  suppressPrince,
} from './military';
import { maybeFoundNorthernCourt, updateNorthernCourt } from './north';
import {
  appointChancellor,
  appointInspector,
  appointMarshal,
  checkInspectorRevolts,
  dismissChancellor,
  dismissInspector,
  dismissMarshal,
  refreshCandidates,
  updateOfficials,
} from './officials';
import {
  checkPrinceMarchOnCapital,
  checkPrinceRevolts,
  curtailPrinces,
  empowerPrince,
  executePrince,
  growRevolts,
  pacifyPrinces,
  updatePrinceRoster,
} from './princes';
import { createRng } from './rng';
import type {
  GameState,
  GameStatus,
  PitchedBattleAction,
  PlayerAction,
  PlayerActions,
  ScoreResult,
  Seed,
  TurnModifiers,
} from './types';

/**
 * 行動枠を消費するか。
 *
 * 突きつけられた要求への応答と、官職の任命だけは消費しない。
 *
 * 応答は相手が始めたことへの返事であって、こちらが1年を費やして
 * 起こす行動ではない。枠を消費させると毎年ほかの手と競合して常に負け、
 * 「何を差し出すか」ではなく「軍を動かすか答えるか」を選ばせることになる。
 *
 * 任命は録尚書事1人と刺史15人の任期がばらばらに切れるので、枠を食わせると
 * ほぼ毎年どちらかの任命に追われ、派遣も徴募もできなくなる。
 * 詔一本の話であって1年を費やす行動ではない。
 *
 * どちらも無償ではない（応答は必ず何かを恒久的に削り、任命には金がかかる）
 */
const SLOT_FREE_ACTIONS: ReadonlySet<PlayerAction['type']> = new Set([
  'tribe_accept_demand',
  'court_appoint_chancellor',
  'court_appoint_inspector',
]);

export function consumesActionSlot(action: PlayerAction): boolean {
  return !SLOT_FREE_ACTIONS.has(action.type);
}

// ── 会戦を挟むターン ──────────────────────────────────

/**
 * 会戦を含むターンの開始。
 *
 * 会戦が選ばれていれば、その年はまだ進めずに戦場を開く。
 * 残りの行動は戦場に預けておき、決着してから concludeBattle() が
 * tick() へ渡す。こうすると戦闘画面を挟んでも
 * コアループの処理順（収入→支出→行動→胡族…）が崩れない
 */
export function beginTurn(state: GameState, actions: PlayerActions, seed: Seed): GameState {
  const battle = actions.find(
    (a): a is PitchedBattleAction => a.type === 'military_pitched_battle',
  );
  if (
    battle === undefined ||
    !canGiveBattle(state, battle.foe) ||
    !availableBattleLeaders(state).includes(battle.leader)
  ) {
    return tick(state, actions, seed);
  }
  const rng = createRng(seed);
  return {
    ...state,
    battlefield: {
      ...openBattlefield(state, battle.foe, battle.leader, rng, battle.mobilize ?? []),
      pendingActions: [...actions],
    },
  };
}

/** 戦場に布陣する。まだ年は進まない */
export function deployBattle(state: GameState, deployment: BattleDeployment): GameState {
  if (state.battlefield === null) return state;
  return { ...state, battlefield: deployBattlefield(state.battlefield, deployment) };
}

/** 一度の激突を解決する。まだ年は進まない */
export function advanceBattle(state: GameState, orders: BattleOrders, seed: Seed): GameState {
  if (state.battlefield === null) return state;
  return { ...state, battlefield: battleRound(state.battlefield, orders, createRng(seed)) };
}

/** 決着した戦場を畳み、預けていた行動でその年を進める */
export function concludeBattle(state: GameState, seed: Seed): GameState {
  const field = state.battlefield;
  if (field === null) return state;

  const finished =
    field.phase === 'done' ? field : autoResolveBattlefield(field, createRng(seed));
  const tactics = battlefieldTactics(finished);

  const actions = finished.pendingActions.map((a) =>
    a.type === 'military_pitched_battle' ? { ...a, tactics } : a,
  );
  return tick({ ...state, battlefield: null }, actions, seed);
}

/**
 * コアループ。必ずこの順序で処理する。
 *
 * 1. 収入
 * 2. 支出（国庫が負なら脱走の判定）
 * 3. プレイヤー行動の適用
 * 4. 胡族の手番 — 成長・移動・侵攻・建国
 * 4B. 北朝の手番 — 華北の統合と南征
 * 5. 都の攻防
 * 6. 支配度と戸口の更新
 * 7. 天命の判定 — 簒奪と禅譲、宗室と刺史の反乱
 * 8. 王朝の更新 — 加齢・寿命と暗殺・継承・任期
 * 9. 歴史イベントの発火判定
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
    // その年の出来事は毎ターン作り直す。前の年のものを持ち越さない
    turnEvents: [],
  };

  next = settleAuxiliaryPay(next);
  next = applyDesertion(next);
  next = checkAuxiliaryDefection(next);

  // 3. プレイヤー行動の適用
  const modifiers: TurnModifiers = {
    pacified: new Set(),
    reinforced: new Set(),
    besieged: new Map(),
  };
  let slotsUsed = 0;
  for (const action of actions) {
    if (consumesActionSlot(action)) {
      if (slotsUsed >= MAX_ACTIONS_PER_TURN) continue;
      slotsUsed++;
    }
    next = applyAction(next, action, modifiers, rng);
  }

  // 4. 胡族の手番
  next = applyFactionActions(next, rng, modifiers);
  next = updateDemands(next, rng);

  // 4B. 北朝。華北をまとめた勢力は、州ごとの敵ではなくもう一つの朝廷になる
  next = maybeFoundNorthernCourt(next);
  next = updateNorthernCourt(next, rng, modifiers);
  // 北朝が攻め落とした城もここで持ち主が決まる
  next = applyProvinceLosses(next, modifiers);
  next = updateHomelands(next, rng);
  next = growRevolts(next);
  // 兵を集めた王は都を衝く。陥とせばその王が帝位に即く
  next = checkPrinceMarchOnCapital(next, rng);

  // 5. 都の攻防
  next = applyCapitalFall(state, next);
  next = checkSouthwardCrossing(next);
  next = applyCapitalPressure(next);

  // 6. 支配度と戸口の更新
  next = updateControl(next);
  next = developProvinces(next);
  next = recoverHouseholds(next);
  next = repairWalls(next, new Set(modifiers.besieged.keys()));
  // 州を得た胡族は帝を称する。要る州の数は野心で決まる
  next = checkProclamations(next);

  // 7. 天命の判定
  next = applyDecay(next);
  if (checkUsurpation(next, rng)) next = abdicate(next, rng);
  next = checkPrinceRevolts(next, rng);
  next = checkInspectorRevolts(next, rng);

  // 8. 王朝と官職の更新
  next = updateDynasty(next, rng);
  next = updatePrinceRoster(next, rng);
  next = updateOfficials(next);
  next = refreshCandidates(next, rng);
  next = settlePendingMarriages(next);

  // 9. 歴史イベントの発火判定
  next = applyHistoricalEvents(next, rng);

  // はじめて胡族に州を奪われた年を記録する。統一の判定はここから先で意味を持つ
  if (next.fragmentedYear === null && isFragmented(next)) {
    next = { ...next, fragmentedYear: next.year };
  }

  /*
   * 天下を統一した年を記録する。
   *
   * **一度も割れていない局は数えない。** 291年の朝廷は開始時点で
   * 天下を保っているので、割れる前に判定すると1ターン目に勝ちになる
   */
  if (next.unifiedYear === null && next.fragmentedYear !== null && isUnified(next)) {
    next = { ...next, unifiedYear: next.year, turnEvents: [...next.turnEvents, 'unified'] };
  }

  return { ...next, status: determineStatus(next) };
}

function applyAction(
  state: GameState,
  action: PlayerAction,
  modifiers: TurnModifiers,
  rng: () => number,
): GameState {
  switch (action.type) {
    case 'tribe_tribute': {
      const paid = payTribute(state, action.factionId);
      if (paid !== state) modifiers.pacified.add(action.factionId);
      return paid;
    }
    case 'tribe_enfeoff':
      return enfeoffFaction(state, action.factionId, action.provinceId);
    case 'tribe_hire':
      return hireAuxiliary(state, action.factionId);
    case 'tribe_accept_demand': {
      const answered = acceptDemand(state, action.factionId);
      if (answered !== state) modifiers.pacified.add(action.factionId);
      return answered;
    }
    case 'tribe_subdue_homeland':
      return subdueHomeland(state, action.homelandId, rng);
    case 'court_marriage':
      return arrangeMarriage(state, action.target, rng);

    case 'court_appoint_chancellor':
      return appointChancellor(state, action.officialId);
    case 'court_dismiss_chancellor':
      return dismissChancellor(state);
    case 'court_appoint_inspector':
      return appointInspector(state, action.provinceId, action.officialId);
    case 'court_dismiss_inspector':
      return dismissInspector(state, action.provinceId);
    case 'military_appoint_marshal':
      return appointMarshal(state, rng);
    case 'military_dismiss_marshal':
      return dismissMarshal(state);

    case 'court_pacify_princes':
      return pacifyPrinces(state);
    case 'court_curtail_princes':
      return curtailPrinces(state);
    case 'court_execute_prince':
      return executePrince(state, action.princeId);
    case 'court_empower_prince':
      return empowerPrince(state, action.princeId);

    case 'military_deploy':
      modifiers.reinforced.add(action.provinceId);
      return applyDeployAttrition(state);
    case 'military_defend':
      return reinforceGarrison(state, action.provinceId);
    case 'military_conscript':
      return conscript(state);
    case 'military_recruit_province':
      return recruitInProvince(state, action.provinceId);
    case 'military_pitched_battle':
      return giveBattle(
        state,
        action.foe,
        action.leader,
        rng,
        action.tactics ?? 1,
        action.mobilize ?? [],
      ).state;
    case 'military_suppress_prince':
      return suppressPrince(state, action.princeId, rng);
    case 'military_northern_expedition':
      return recoverProvince(state, action.provinceId, rng);

    case 'domestic_raise_taxes':
      return raiseTaxes(state);
    case 'domestic_reorganize_army':
      return reorganizeArmy(state);
    case 'domestic_confirm_privilege':
      return confirmPrivilege(state);
    case 'domestic_hold_conversation':
      return holdConversation(state);
    case 'domestic_grant_rank':
      return grantRank(state);
    case 'domestic_settle_refugees':
      return settleRefugees(state);
    case 'domestic_register_households':
      return registerHouseholds(state);
    case 'domestic_move_capital':
      return moveCapital(state, action.provinceId);
  }
}

/**
 * 天下統一。
 *
 * すべての州を朝廷が保ち、**北朝も胡族の国もひとつも残っていない**状態。
 * 州の数だけで判じていたときは、挙兵した王を討ち取って州を取り戻すたびに
 * 「天下を統一した」ことになり、294年に勝つ局が出た。
 * 589年に隋が成し遂げたのは、割れた国をすべて呑み込むことだった
 */
export function isUnified(state: GameState): boolean {
  if (state.north !== null) return false;
  if (Object.values(state.factions).some((f) => f.stance === 'enfeoffed')) return false;
  return Object.values(state.provinces).every((p) => p.holder === null && p.control > 0);
}

/** 天下が割れたか。胡族か北朝が州を握っていることを指す */
export function isFragmented(state: GameState): boolean {
  if (state.north !== null) return true;
  return Object.values(state.provinces).some(
    (p) => p.holder !== null && p.holder !== 'prince',
  );
}

/** 州の総数。統一と分裂の判定に使う */
export const TOTAL_PROVINCES = 15;

export function heldProvinceCount(state: GameState): number {
  return Object.values(state.provinces).filter((p) => p.holder === null && p.control > 0).length;
}

/** スコア = 保持州数 × 戸口 × 天命 */
export function evaluateScore(state: GameState): ScoreResult {
  const provincesHeld =
    heldProvinceCount(state) +
    Object.values(state.homelands).filter((h) => h.owner === 'court').length;
  return {
    status: state.status,
    finalYear: state.year,
    provincesHeld,
    taxBase: state.taxBase,
    mandate: state.mandate,
    score: Math.round(provincesHeld * state.taxBase * state.mandate),
    difficulty: state.difficulty,
    houseName: state.dynasty.houseName,
    rulerCount: state.dynasty.history.length + 1,
    houseChanges: new Set(state.dynasty.history.map((d) => d.houseName)).size,
    abilitiesAdjusted: state.dynasty.abilitiesAdjusted,
    unifiedYear: state.unifiedYear,
    crossedSouthYear: state.crossedSouthYear,
  };
}

function determineStatus(state: GameState): GameStatus {
  if (state.status === 'fallen') return 'fallen';
  if (state.status === 'unified') return 'unified';

  const armyDestroyed = state.centralArmy <= ARMY_COLLAPSE_THRESHOLD;
  const bankrupt = state.treasury <= 0;
  const held = heldProvinceCount(state);

  // 州も兵も金も尽きた朝廷は、名だけの存在ですらいられない
  if (held < SURVIVAL_MIN_PROVINCES || (armyDestroyed && bankrupt)) return 'fallen';

  /*
   * 天下統一はその年に局を終わらせる。
   *
   * 西ローマの統一が「通過点」だったのに対し、こちらは統一そのものが
   * 題名の到達点なので、達したらそこで局を閉じる
   */
  if (state.unifiedYear !== null) return 'unified';

  if (state.year >= ENDING_YEAR) {
    /*
     * 589年。この年までに統一できなければ、統一するのは隋のほうになる。
     * 名だけの傀儡として残っていた朝廷も、ここで呑まれる
     */
    if (state.mandate < SURVIVAL_MIN_MANDATE) return 'fallen';
    return 'survived';
  }

  return 'ongoing';
}
