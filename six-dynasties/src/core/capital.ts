import {
  CAPITAL_FALL_MANDATE_LOSS,
  CAPITAL_NAMES,
  CAPITAL_PRESSURE_CONTROL_LOSS,
  CROSS_SOUTH_GENTRY_GAIN,
  CROSS_SOUTH_MANDATE_LOSS,
  CROSS_SOUTH_PROVINCE,
  CROSS_SOUTH_TAX_BASE_LOSS,
  TAX_BASE_MAX,
} from './constants';
import type { GameState, ProvinceId } from './types';
import { clamp, clamp100 } from './util';

/**
 * 都が敵の手に落ちたときの処理。
 *
 * 北に都を置いたまま失えば、朝廷は江南へ移る（衣冠南渡）。
 * これは敗北ではない。**317年の東晋がそうだったように、
 * 都を移した朝廷は三百年続く。** 代わりに北の戸口と天命を失い、
 * 南渡してきた士族が朝廷を支えるようになる
 */
export function applyCapitalFall(before: GameState, state: GameState): GameState {
  const capital = state.provinces[state.capital];
  const wasHeld = before.provinces[before.capital].holder === null;
  if (!wasHeld || capital.holder === null) return state;

  let next: GameState = {
    ...state,
    mandate: clamp100(state.mandate - CAPITAL_FALL_MANDATE_LOSS),
    turnEvents: [...state.turnEvents, 'capital_fell'],
  };

  // 北にまだ都を置ける州が残っていれば、そちらへ退く
  const fallback = (Object.keys(CAPITAL_NAMES) as ProvinceId[]).find((id) => {
    const province = next.provinces[id];
    return province !== undefined && province.holder === null && province.control > 20;
  });

  if (fallback === undefined) return next;

  const crossing = next.crossedSouthYear === null && next.provinces[fallback].region === 'south';
  next = {
    ...next,
    capital: fallback,
    capitalName: CAPITAL_NAMES[fallback] ?? '',
    turnEvents: [...next.turnEvents, 'capital_moved'],
  };

  if (!crossing) return next;

  // 衣冠南渡。北の戸口を捨て、江南で朝廷を立て直す
  return {
    ...next,
    crossedSouthYear: next.year,
    mandate: clamp100(next.mandate - CROSS_SOUTH_MANDATE_LOSS),
    taxBase: clamp(next.taxBase - CROSS_SOUTH_TAX_BASE_LOSS, 0, TAX_BASE_MAX),
    gentry: clamp100(next.gentry + CROSS_SOUTH_GENTRY_GAIN),
    turnEvents: [...next.turnEvents, 'crossed_south'],
  };
}

/**
 * 北の州をすべて失った朝廷は、都がどこであれ江南の政権になる。
 * 遷都を経ずに北を失い切った局でも南渡として記録する
 */
export function checkSouthwardCrossing(state: GameState): GameState {
  if (state.crossedSouthYear !== null) return state;
  const northHeld = Object.values(state.provinces).filter(
    (p) => p.region === 'north' && p.holder === null && p.control > 0,
  );
  if (northHeld.length > 0) return state;

  const refuge = state.provinces[CROSS_SOUTH_PROVINCE];
  if (refuge === undefined || refuge.holder !== null) return state;

  return {
    ...state,
    capital: CROSS_SOUTH_PROVINCE,
    capitalName: CAPITAL_NAMES[CROSS_SOUTH_PROVINCE] ?? '建康',
    crossedSouthYear: state.year,
    mandate: clamp100(state.mandate - CROSS_SOUTH_MANDATE_LOSS),
    taxBase: clamp(state.taxBase - CROSS_SOUTH_TAX_BASE_LOSS, 0, TAX_BASE_MAX),
    gentry: clamp100(state.gentry + CROSS_SOUTH_GENTRY_GAIN),
    turnEvents: [...state.turnEvents, 'crossed_south'],
  };
}

/** 都を敵に押さえられているあいだ、州は動揺し続ける */
export function applyCapitalPressure(state: GameState): GameState {
  const capital = state.provinces[state.capital];
  if (capital === undefined || capital.holder === null) return state;

  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    if (province.holder !== null) continue;
    provinces[id] = {
      ...province,
      control: clamp100(province.control - CAPITAL_PRESSURE_CONTROL_LOSS),
    };
  }
  return { ...state, provinces };
}
