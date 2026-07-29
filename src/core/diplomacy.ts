import type { BarbarianFactionId, GameState, ProvinceId } from './types';
import {
  EAST_AID_ARMY_GAIN,
  EAST_AID_MIN_RELATIONS,
  EAST_AID_RELATIONS_LOSS,
  EAST_AID_TREASURY_GAIN,
  EAST_TITLE_COST,
  EAST_TITLE_LEGITIMACY_GAIN,
  EAST_TITLE_RELATIONS_LOSS,
  FOEDERATI_DEMAND_ESCALATION,
  FOEDERATI_DEMAND_PER_STRENGTH,
  FOEDERATI_HIRE_COST,
  FOEDERATI_HIRE_LEGITIMACY_LOSS,
  FOEDERATI_LOYALTY_DECAY_UNPAID,
  FOEDERATI_LOYALTY_RECOVERY,
  FOEDERATI_TAX_BASE_DRAIN,
  LEGITIMACY_LOSS_PER_SETTLEMENT,
  MARRIAGE_COST,
  MARRIAGE_LEGITIMACY_LOSS,
  MARRIAGE_LOYALTY_GAIN,
  MAX_EAST_RELATIONS,
  MAX_FOEDERATI_LOYALTY,
  MAX_LEGITIMACY,
  MAX_TAX_BASE,
  MIN_EAST_RELATIONS,
  MIN_FOEDERATI_LOYALTY,
  MIN_LEGITIMACY,
  MIN_TAX_BASE,
  SETTLE_TAX_BASE_LOSS,
  TRIBUTE_LOYALTY_GAIN,
} from './constants';
import { clamp } from './util';

/** 契約時の給金。強力な勢力ほど高い */
export function foederatiDemandFor(strength: number): number {
  return strength * FOEDERATI_DEMAND_PER_STRENGTH;
}

/** 貢納で和平を買う。その勢力はこのターン攻撃してこない */
export function payTribute(
  state: GameState,
  factionId: BarbarianFactionId,
  amount: number,
): GameState {
  if (state.treasury < amount) return state;
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;
  return {
    ...state,
    treasury: state.treasury - amount,
    foederatiLoyalty:
      faction.stance === 'foederati'
        ? clamp(
            state.foederatiLoyalty + TRIBUTE_LOYALTY_GAIN,
            MIN_FOEDERATI_LOYALTY,
            MAX_FOEDERATI_LOYALTY,
          )
        : state.foederatiLoyalty,
  };
}

/**
 * 土地を与えて定住させる。戦線はただちに消えるが、
 * その属州の税収と帝国全体の税基盤を恒久的に失う
 */
export function settleFaction(
  state: GameState,
  factionId: BarbarianFactionId,
  provinceId: ProvinceId,
): GameState {
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;
  const province = state.provinces[provinceId];
  return {
    ...state,
    provinces: { ...state.provinces, [provinceId]: { ...province, baseTax: 0 } },
    factions: {
      ...state.factions,
      [factionId]: { ...faction, stance: 'settled', location: provinceId, demand: null },
    },
    taxBase: clamp(state.taxBase - SETTLE_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE),
    legitimacy: clamp(
      state.legitimacy - LEGITIMACY_LOSS_PER_SETTLEMENT,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

/** 婚姻同盟: 金と引き換えに敵勢力をフォエデラティに引き入れる */
export function arrangeMarriage(state: GameState, factionId: BarbarianFactionId): GameState {
  if (state.treasury < MARRIAGE_COST) return state;
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;
  return {
    ...state,
    treasury: state.treasury - MARRIAGE_COST,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        stance: 'foederati',
        demand: { type: 'gold', amount: foederatiDemandFor(faction.strength) },
      },
    },
    foederatiLoyalty: clamp(
      state.foederatiLoyalty + MARRIAGE_LOYALTY_GAIN,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
    legitimacy: clamp(
      state.legitimacy - MARRIAGE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

/**
 * フォエデラティ契約。目先の戦線を安く埋められるが、
 * 毎ターンの給金が発生し、途切れれば寝返る
 */
export function hireFoederati(state: GameState, factionId: BarbarianFactionId): GameState {
  if (state.treasury < FOEDERATI_HIRE_COST) return state;
  const faction = state.factions[factionId];
  if (faction.stance !== 'hostile') return state;
  return {
    ...state,
    treasury: state.treasury - FOEDERATI_HIRE_COST,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        stance: 'foederati',
        demand: { type: 'gold', amount: foederatiDemandFor(faction.strength) },
      },
    },
    legitimacy: clamp(
      state.legitimacy - FOEDERATI_HIRE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

/** 東帝国への援軍要請。関係を消費して金と兵を得る */
export function requestEastAid(state: GameState): GameState {
  if (state.eastRelations < EAST_AID_MIN_RELATIONS) return state;
  return {
    ...state,
    treasury: state.treasury + EAST_AID_TREASURY_GAIN,
    fieldArmy: state.fieldArmy + EAST_AID_ARMY_GAIN,
    eastRelations: clamp(
      state.eastRelations - EAST_AID_RELATIONS_LOSS,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/** 東帝国から帝位の承認を取り付ける */
export function confirmTitle(state: GameState): GameState {
  if (state.treasury < EAST_TITLE_COST) return state;
  return {
    ...state,
    treasury: state.treasury - EAST_TITLE_COST,
    legitimacy: clamp(
      state.legitimacy + EAST_TITLE_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    eastRelations: clamp(
      state.eastRelations - EAST_TITLE_RELATIONS_LOSS,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/**
 * 給金の支払い実績に忠誠を連動させる。
 * 支出を賄えなかったターン（国庫が負）は未払いとみなす
 */
export function updateFoederatiLoyalty(state: GameState): GameState {
  const hasFoederati = Object.values(state.factions).some(
    (faction) => faction.stance === 'foederati',
  );
  if (!hasFoederati) return state;

  const delta =
    state.treasury < 0 ? -FOEDERATI_LOYALTY_DECAY_UNPAID : FOEDERATI_LOYALTY_RECOVERY;
  return {
    ...state,
    foederatiLoyalty: clamp(
      state.foederatiLoyalty + delta,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
  };
}

/**
 * フォエデラティに依存し続けることの長期的な代償。
 * 給金の要求は年々膨らみ、駐屯地の税基盤は恒久的に失われていく
 */
export function updateFoederatiObligations(state: GameState): GameState {
  const factionIds = (Object.keys(state.factions) as BarbarianFactionId[]).filter(
    (id) => state.factions[id].stance === 'foederati',
  );
  if (factionIds.length === 0) return state;

  const factions = { ...state.factions };
  for (const id of factionIds) {
    const faction = factions[id];
    if (!faction.demand) continue;
    factions[id] = {
      ...faction,
      demand: {
        ...faction.demand,
        amount: faction.demand.amount * (1 + FOEDERATI_DEMAND_ESCALATION),
      },
    };
  }

  return {
    ...state,
    factions,
    taxBase: clamp(
      state.taxBase - FOEDERATI_TAX_BASE_DRAIN * factionIds.length,
      MIN_TAX_BASE,
      MAX_TAX_BASE,
    ),
  };
}
