import {
  CONSCRIPT_COST,
  DEFEND_COST,
  FOEDERATI_HIRE_COST,
  MARRIAGE_COST,
  MAX_ACTIONS_PER_TURN,
} from '../core/constants';
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
 */
export type Strategy = (state: GameState) => PlayerActions;

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

function pair(actions: PlayerAction[]): PlayerActions {
  if (actions.length === 0) return [];
  if (actions.length === 1) return [actions[0]];
  return [actions[0], actions[1]];
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
  if (actions.length < MAX_ACTIONS_PER_TURN && state.senateSupport < 40) {
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

export const strategies: Record<string, Strategy> = {
  passive,
  defensive,
  foederati: foederatiHeavy,
};
