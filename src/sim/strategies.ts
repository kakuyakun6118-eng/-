import {
  CONSCRIPT_COST,
  DEFEND_COST,
  FOEDERATI_HIRE_COST,
  GENERAL_APPOINT_COST,
  MARRIAGE_COST,
  MAX_ACTIONS_PER_TURN,
} from '../core/constants';
import { consumesActionSlot } from '../core/tick';
import type {
  BarbarianFaction,
  GameState,
  PlayerAction,
  PlayerActions,
  ProvinceId,
} from '../core/types';

/**
 * ヘッドレス検証用の自動プレイ方針。
 * ゲームロジックではなく評価用のハーネスなので core/ には置かない。
 * 以下の閾値も方針AIの判断基準であってゲームルールではないため、
 * core/constants.ts ではなくこのファイルに置く
 */
export type Strategy = (state: GameState) => PlayerActions;

/** 限定使用: この兵力を下回ったときだけ蛮族を雇う */
const LIMITED_ARMY_FLOOR = 40;
/** 限定使用: 同時に抱えるフォエデラティの上限 */
const LIMITED_FOEDERATI_CAP = 2;
/** 元老院への譲歩を検討する支持の水準 */
const SENATE_SUPPORT_FLOOR = 40;

function hostileInProvinces(state: GameState): BarbarianFaction[] {
  return Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.location !== 'exterior',
  );
}

/** 侵入を受けている属州のうち最も支配度が低いもの */
function mostThreatenedProvince(state: GameState): ProvinceId | null {
  const invaded = hostileInProvinces(state)
    .map((faction) => faction.location as ProvinceId)
    .sort((a, b) => state.provinces[a].control - state.provinces[b].control);
  return invaded[0] ?? null;
}

/**
 * 行動枠に収める。要求への応答は枠を消費しないので、
 * 枠を使う行動だけを MAX_ACTIONS_PER_TURN まで数える
 */
function pair(actions: PlayerAction[]): PlayerActions {
  const kept: PlayerAction[] = [];
  let slots = 0;
  for (const action of actions) {
    if (!consumesActionSlot(action)) {
      kept.push(action);
      continue;
    }
    if (slots >= MAX_ACTIONS_PER_TURN) continue;
    slots++;
    kept.push(action);
  }
  return kept;
}

/** 何もしない。受動プレイの基準値 */
export const passive: Strategy = () => [];

/**
 * 正攻法。蛮族は雇わず、自前の軍と属州防衛で凌ぐ。
 * 元老院の支持を保ちながら軍を維持する
 */
export const defensive: Strategy = (state) => {
  const actions: PlayerAction[] = [];
  const threatened = mostThreatenedProvince(state);

  if (threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
    if (state.treasury > DEFEND_COST * 2) {
      actions.push({ type: 'military_defend', provinceId: threatened });
    }
  }

  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.senateSupport < SENATE_SUPPORT_FLOOR) {
    actions.push({ type: 'domestic_appease_senate' });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 蛮族依存。目先の戦線を金で埋め続ける。
 * 「短期と長期の取引」で短期を選び続けた場合の帰結を測る
 */
export const foederatiHeavy: Strategy = (state) => {
  const actions: PlayerAction[] = [];

  const hostileAtBorder = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile',
  );

  for (const faction of hostileAtBorder) {
    if (actions.length >= MAX_ACTIONS_PER_TURN) break;
    if (state.treasury > FOEDERATI_HIRE_COST * 2) {
      actions.push({ type: 'hire_foederati', factionId: faction.id });
    }
  }

  // 雇えないなら土地を与えて黙らせる
  const invader = hostileInProvinces(state)[0];
  if (actions.length < MAX_ACTIONS_PER_TURN && invader && invader.location !== 'exterior') {
    actions.push({
      type: 'negotiate_settle',
      factionId: invader.id,
      provinceId: invader.location,
    });
  }

  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury < MARRIAGE_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 限定使用。自軍が細ったときだけ少数のフォエデラティを雇い、
 * 平時は自前の軍で凌ぐ。短期と長期の折衷案
 */
export const limitedFoederati: Strategy = (state) => {
  const actions: PlayerAction[] = [];
  const foederatiCount = Object.values(state.factions).filter(
    (faction) => faction.stance === 'foederati',
  ).length;
  const invader = hostileInProvinces(state)[0];

  if (
    invader &&
    state.fieldArmy < LIMITED_ARMY_FLOOR &&
    foederatiCount < LIMITED_FOEDERATI_CAP &&
    state.treasury > FOEDERATI_HIRE_COST * 2
  ) {
    actions.push({ type: 'hire_foederati', factionId: invader.id });
  }

  const threatened = mostThreatenedProvince(state);
  if (actions.length < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 宥和。突きつけられた要求を最優先で飲み、残った枠で軍を維持する。
 * 「要求に答える」ことが本当に選択肢として成立しているかを測るための方針
 */
export const appeaser: Strategy = (state) => {
  const actions: PlayerAction[] = [];

  const demanding = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.demand !== null,
  );
  for (const faction of demanding) {
    const demand = faction.demand;
    if (demand === null) continue;
    // 金の要求は払えるときだけ飲む
    if (demand.type === 'gold' && state.treasury < demand.amount) continue;
    actions.push({ type: 'negotiate_accept_demand', factionId: faction.id });
  }

  const threatened = mostThreatenedProvince(state);
  if (actions.length < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (actions.length < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 軍司令官を使う方針。
 * 空位なら任命し、正統性が簒奪の圏内に落ちたときだけ名将を切る。
 * 史実の408年（スティリコ）・454年（アエティウス）と同じ形
 */
const GENERAL_PURGE_LEGITIMACY = 35;
const GENERAL_PURGE_MIN_MILITARY = 7;

export const generalMinded: Strategy = (state) => {
  const actions: PlayerAction[] = [];

  for (const faction of Object.values(state.factions)) {
    if (faction.stance !== 'hostile' || faction.demand === null) continue;
    if (faction.demand.type !== 'gold' || state.treasury < faction.demand.amount) continue;
    actions.push({ type: 'negotiate_accept_demand', factionId: faction.id });
  }

  const slots = () => actions.filter(consumesActionSlot).length;
  const general = state.general.current;
  if (general === null && state.treasury > GENERAL_APPOINT_COST * 2) {
    actions.push({ type: 'military_appoint_general' });
  } else if (
    general !== null &&
    general.military >= GENERAL_PURGE_MIN_MILITARY &&
    state.legitimacy < GENERAL_PURGE_LEGITIMACY
  ) {
    actions.push({ type: 'military_dismiss_general' });
  }

  const threatened = mostThreatenedProvince(state);
  if (slots() < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

export const strategies: Record<string, Strategy> = {
  passive,
  limited: limitedFoederati,
  defensive,
  foederati: foederatiHeavy,
  appeaser,
  general: generalMinded,
};
