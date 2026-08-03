import { applyBarbarianActions } from './barbarians';
import {
  giveBattle,
  suppressUsurper,
  updateUpheaval,
  updateUsurpers,
  usurperHeldProvinces,
} from './battle';
import {
  ENDING_YEAR,
  FIELD_ARMY_COLLAPSE_THRESHOLD,
  MAX_ACTIONS_PER_TURN,
  SURVIVAL_MIN_LEGITIMACY,
} from './constants';
import {
  acceptDemand,
  arrangeMarriage,
  confirmTitle,
  hireFoederati,
  payTribute,
  requestEastAid,
  settleFaction,
  settlePendingMarriages,
  updateBarbarianDemands,
  updateFoederatiLoyalty,
  updateFoederatiObligations,
} from './diplomacy';
import { updateDynasty } from './dynasty';
import { appointGeneral, dismissGeneral, updateGeneral } from './general';
import {
  declareWarOnEast,
  improveEastRelations,
  improvePersiaRelations,
  invadeEastProvince,
  isUnified,
  makePeaceWithEast,
  updateEasternFront,
} from './east';
import { applyHistoricalEvents } from './events';
import { conquerHomeland, updateHomelands } from './homelands';
import {
  appointGovernor,
  appointPrefect,
  checkRevolts,
  dismissGovernor,
  dismissPrefect,
  updateOfficials,
} from './officials';
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
 * 行動枠を消費するか。
 *
 * 突きつけられた要求への応答だけは消費しない。相手が始めたことへの
 * 返事であって、こちらが1年を費やして起こす行動ではないため。
 *
 * 枠を消費させると、応答は毎年 military_deploy と競合して常に負ける。
 * それでは「金・土地・正統性のどれを差し出すか」ではなく
 * 「軍を動かすか要求に答えるか」を選ばせることになり、主題からずれる。
 * 無償にはしない。応答は必ず国庫・税基盤・正統性のいずれかを削る。
 *
 * この判断はヘッドレス計測では裏を取れない。方針AIは枠を平均1.5/2
 * しか使っておらず、枠の逼迫そのものを再現できていないため
 */
/**
 * 官職の任命も枠を消費しない。
 *
 * 長官1人と総督7人は任期がばらばらに切れるので、枠を食わせると
 * ほぼ毎年どちらかの任命に追われ、派遣も徴募もできなくなる。
 * 実測では枠を消費させた場合に生存率が中級37%→24%まで落ちた。
 * 任命は勅令一本の話であって、1年を費やす行動ではない。
 *
 * 無償ではない。任命には金がかかり、有能でも野心の高い人物を
 * 選べば反乱の確率が上がる。「誰を選ぶか」に判断を寄せる。
 * 解任のほうは枠を消費させる（正統性が戻る政治的な行為なので、
 * 無料の上振れにしない）
 */
const SLOT_FREE_ACTIONS: ReadonlySet<PlayerAction['type']> = new Set([
  'negotiate_accept_demand',
  'appoint_prefect',
  'appoint_governor',
]);

export function consumesActionSlot(action: PlayerAction): boolean {
  return !SLOT_FREE_ACTIONS.has(action.type);
}

/**
 * コアループ。収入・支出・プレイヤー行動・蛮族AI・戦闘解決・
 * 支配度と税基盤の更新・正統性判定・王朝の更新・歴史イベントの
 * 発火判定を、この順で処理する。
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

  next = applyDesertion(next);
  next = updateFoederatiLoyalty(next);

  // 3. プレイヤー行動の適用
  const modifiers: TurnModifiers = { pacified: new Set(), reinforced: new Set() };
  let slotsUsed = 0;
  for (const action of actions) {
    if (consumesActionSlot(action)) {
      if (slotsUsed >= MAX_ACTIONS_PER_TURN) continue;
      slotsUsed++;
    }
    next = applyAction(next, action, modifiers, rng);
  }

  // 4. 蛮族AIの行動 / 5. 戦闘解決
  next = applyBarbarianActions(next, rng, modifiers);
  // 属州に居座る勢力は要求を突きつける。答えられるのは翌年になる
  next = updateBarbarianDemands(next, rng);

  /*
   * 4B. 東方戦線。統一シナリオでのみ動く。
   * 蛮族の手番と同じ位置に置く。東の反撃もペルシアの侵攻も
   * 「こちらの行動のあとに相手が動く」という同じ順序にするため
   */
  next = updateEasternFront(next, rng);
  // 併合した郷里の落ち着きと、元の主による奪還
  next = updateHomelands(next, rng);
  // 僭称帝国は年ごとに兵を蓄える
  next = updateUsurpers(next);

  // 6. 支配度と税基盤の更新
  next = updateControl(next);
  next = updateFoederatiObligations(next);

  // 7. 正統性判定
  next = applyLegitimacyDecay(next);
  next = applySenateDecay(next);
  next = checkUsurper(next, rng);
  /*
   * 属州総督と皇帝の兄弟の反乱。簒奪判定の直後に置く。
   * どちらも正統性が低い年にだけ起きるので、判定の順序を
   * 正統性が確定したあとに揃える
   */
  next = checkRevolts(next, rng);
  // 敗報による動揺は年ごとに冷めていく
  next = updateUpheaval(next);

  // 8. 王朝の更新（加齢・出生・寿命と暗殺の判定・継承）
  next = updateDynasty(next, rng);
  // 軍司令官の任期。退任しても後任は自動では決まらない
  next = updateGeneral(next);
  // 長官と総督の任期。退任しても後任は自動では決まらない
  next = updateOfficials(next, rng);
  // 婚姻のうち、子が生まれて初めて発生する効果を清算する
  next = settlePendingMarriages(next);

  // 9. 歴史イベントテーブルの発火判定
  next = applyHistoricalEvents(next, rng);

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
    case 'negotiate_accept_demand': {
      const answered = acceptDemand(state, action.factionId);
      // 金で要求を満たしたなら、その年の侵攻も止まる
      if (answered !== state) modifiers.pacified.add(action.factionId);
      return answered;
    }
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
    case 'appoint_prefect':
      return appointPrefect(state, action.officialId);
    case 'dismiss_prefect':
      return dismissPrefect(state);
    case 'appoint_governor':
      return appointGovernor(state, action.provinceId, action.officialId);
    case 'dismiss_governor':
      return dismissGovernor(state, action.provinceId);
    case 'military_appoint_general':
      return appointGeneral(state, rng);
    case 'military_dismiss_general':
      return dismissGeneral(state);
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
    case 'east_improve_relations':
      return improveEastRelations(state);
    case 'east_declare_war':
      return declareWarOnEast(state, state.year);
    case 'east_invade':
      return invadeEastProvince(state, action.provinceId, rng);
    case 'east_make_peace':
      return makePeaceWithEast(state);
    case 'persia_improve_relations':
      return improvePersiaRelations(state);
    case 'military_pitched_battle':
      return giveBattle(state, action.foe, action.leader, rng).state;
    case 'military_suppress_usurper':
      return suppressUsurper(state, action.usurperId, rng);
    case 'conquer_homeland':
      return conquerHomeland(state, action.factionId, rng);
  }
}

/** スコア = 保持属州数 × taxBase × legitimacy */
export function evaluateScore(state: GameState): ScoreResult {
  // 征服した東方属州も保持属州として数える
  const held = usurperHeldProvinces(state);
  const provincesHeld =
    Object.values(state.provinces).filter((p) => p.control > 0 && !held.has(p.id)).length +
    state.east.provinces.filter((p) => p.owner === 'west' && p.control > 0).length +
    // 併合した蛮族の郷里も保持領域に数える
    Object.values(state.homelands).filter((h) => h.owner === 'west' && h.control > 0).length;
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
  // 決着した局はそのまま。統一は勝利なのでその年でゲームが終わる
  if (state.status === 'collapsed') return 'collapsed';
  if (state.status === 'unified') return 'unified';

  const italiaLost = state.provinces.Italia.control <= 0;
  const armyDestroyed = state.fieldArmy <= FIELD_ARMY_COLLAPSE_THRESHOLD;
  const bankrupt = state.treasury <= 0;

  if (italiaLost || (armyDestroyed && bankrupt)) {
    return 'collapsed';
  }

  /*
   * 統一シナリオの勝利。476年を待たずにその場で決まる。
   * 東方属州をすべて西の持ち物にすることが条件で、
   * ペルシアに1つでも握られていれば成立しない
   */
  if (isUnified(state)) return 'unified';

  if (state.year >= ENDING_YEAR) {
    const loyal = usurperHeldProvinces(state);
    const provincesHeld = Object.values(state.provinces).filter(
      (p) => p.control > 0 && !loyal.has(p.id),
    ).length;
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
