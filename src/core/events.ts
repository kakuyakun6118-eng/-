import eventsData from '../data/events.json';
import {
  MAX_CONTROL,
  MAX_EAST_RELATIONS,
  MAX_FOEDERATI_LOYALTY,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MAX_TAX_BASE,
  MIN_CONTROL,
  MIN_EAST_RELATIONS,
  MIN_FOEDERATI_LOYALTY,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  MIN_TAX_BASE,
} from './constants';
import type {
  EventCondition,
  GameState,
  HistoricalEvent,
  ProvinceId,
  StateCondition,
} from './types';
import { clamp } from './util';

const EVENTS = eventsData as HistoricalEvent[];

/** GameState 内をドット区切りのパスで辿る。events.json の field 指定用 */
function readPath(state: GameState, path: string): unknown {
  let current: unknown = state;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** パスの位置だけを差し替えた新しい state を返す。破壊的変更はしない */
function writePath(state: GameState, path: string, value: unknown): GameState {
  const keys = path.split('.');

  const assign = (node: unknown, depth: number): unknown => {
    if (depth === keys.length) return value;
    if (node === null || typeof node !== 'object') return node;
    const key = keys[depth];
    const copy: Record<string, unknown> = { ...(node as Record<string, unknown>) };
    copy[key] = assign(copy[key], depth + 1);
    return copy;
  };

  return assign(state, 0) as GameState;
}

function compare(actual: unknown, condition: StateCondition): boolean {
  const expected = condition.value;
  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    default:
      break;
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  switch (condition.operator) {
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
  }
}

/**
 * 発火条件。年だけでなく状態にも依存させることで、
 * プレイヤーの行動次第で史実が起きない余地を残す
 */
function conditionMet(state: GameState, condition: EventCondition): boolean {
  if (condition.year !== undefined && state.year !== condition.year) return false;
  if (condition.minYear !== undefined && state.year < condition.minYear) return false;
  if (condition.maxYear !== undefined && state.year > condition.maxYear) return false;

  for (const stateCondition of condition.stateConditions ?? []) {
    if (!compare(readPath(state, stateCondition.field), stateCondition)) return false;
  }
  return true;
}

/** 効果適用後に範囲外へ出た値を戻す */
function clampState(state: GameState): GameState {
  const provinces = { ...state.provinces };
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    provinces[id] = {
      ...province,
      control: clamp(province.control, MIN_CONTROL, MAX_CONTROL),
      baseTax: Math.max(0, province.baseTax),
      garrison: Math.max(0, province.garrison),
    };
  }

  const factions = { ...state.factions };
  for (const id of Object.keys(factions) as (keyof typeof factions)[]) {
    factions[id] = { ...factions[id], strength: Math.max(0, factions[id].strength) };
  }

  return {
    ...state,
    provinces,
    factions,
    taxBase: clamp(state.taxBase, MIN_TAX_BASE, MAX_TAX_BASE),
    legitimacy: clamp(state.legitimacy, MIN_LEGITIMACY, MAX_LEGITIMACY),
    senateSupport: clamp(state.senateSupport, MIN_SENATE_SUPPORT, MAX_SENATE_SUPPORT),
    eastRelations: clamp(state.eastRelations, MIN_EAST_RELATIONS, MAX_EAST_RELATIONS),
    foederatiLoyalty: clamp(
      state.foederatiLoyalty,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
    fieldArmy: Math.max(0, state.fieldArmy),
  };
}

function applyEvent(state: GameState, event: HistoricalEvent): GameState {
  let next = state;
  for (const effect of event.effects) {
    if (effect.set !== undefined) {
      next = writePath(next, effect.field, effect.set);
    } else if (effect.delta !== undefined) {
      const current = readPath(next, effect.field);
      if (typeof current !== 'number') continue;
      next = writePath(next, effect.field, current + effect.delta);
    }
  }
  return clampState(next);
}

/**
 * コアループ ステップ9: 歴史イベントテーブルの発火判定。
 * 条件は data/events.json に持ち、コードには埋め込まない
 */
export function applyHistoricalEvents(state: GameState): GameState {
  let next = state;
  const fired: string[] = [];

  for (const event of EVENTS) {
    if (event.onceOnly && next.firedEventIds.includes(event.id)) continue;
    if (!conditionMet(next, event.condition)) continue;
    next = applyEvent(next, event);
    fired.push(event.id);
  }

  if (fired.length === 0) return next;
  return { ...next, firedEventIds: [...next.firedEventIds, ...fired] };
}

/** 画面やログ用にイベントの定義を引く */
export function findEvent(id: string): HistoricalEvent | undefined {
  return EVENTS.find((event) => event.id === id);
}
